// Quantized county centerlines retain grade-separated end nodes and permitted directions.
// Times use the county's directional travel costs. Live traffic and turn costs are unavailable.
const SCALE = 100000;
const CELL = .006;
const MAX_SNAP_METERS = 400;
const LAT_M = 111200;
const LNG_M = 100200;

export function decodeNetwork(buffer) {
  const bytes=new Uint8Array(buffer);
  if(bytes.length<6||String.fromCharCode(...bytes.subarray(0,4))!=='BGR1')throw new Error('Invalid road network.');
  let pos=4;
  function uint() {
    let total=0,mult=1;
    for(let n=0;n<6 && pos<bytes.length;n++) {
      const b=bytes[pos++];total+=(b&127)*mult;
      if(b<128)return total;
      mult*=128;
    }
    throw new Error('Road network is incomplete.');
  }
  const sint=()=>{const v=uint();return v%2?-(v+1)/2:v/2;};
  const count=uint(),edgeCount=uint();
  if(count<1||edgeCount<1||count>180000||edgeCount>250000)throw new Error('Invalid Miami network size.');
  const points=[],edges=[],adj=Array.from({length:count},()=>[]),cells=new Map();
  let x=0,y=0;
  for(let n=0;n<count;n++) {x+=sint();y+=sint();points.push([y/SCALE,x/SCALE]);}
  let from=0;
  for(let i=0;i<edgeCount;i++) {
    from+=uint();const to=from+sint(),flags=uint(),metres=uint(),ft=uint(),tf=flags&4?uint():ft;
    if(from>=count||to<0||to>=count)throw new Error('Invalid Miami road junction.');
    const direction=flags&3,roadClass=flags>>3,values=[points[from]],n=uint();
    let lng=Math.round(points[from][1]*SCALE),lat=Math.round(points[from][0]*SCALE);
    for(let k=0;k<n;k++){lng+=sint();lat+=sint();values.push([lat/SCALE,lng/SCALE]);}
    values.push(points[to]);
    let geometryLength=0;const offsets=[0];
    for(let k=1;k<values.length;k++){geometryLength+=meters(values[k-1],values[k]);offsets.push(geometryLength);}
    const edge={from,to,values,offsets,geometryLength,metres,ft,tf,direction};
    edges.push(edge);
    if(direction&1)adj[from].push(i+1);
    if(direction&2)adj[to].push(-(i+1));
    if(roadClass<2)continue; // Never place a home or school on a limited-access road.
    const seen=new Set();
    for(let k=1;k<values.length;k++){
      const a=values[k-1],b=values[k];
      const x0=Math.floor(Math.min(a[1],b[1])/CELL),x1=Math.floor(Math.max(a[1],b[1])/CELL);
      const y0=Math.floor(Math.min(a[0],b[0])/CELL),y1=Math.floor(Math.max(a[0],b[0])/CELL);
      for(let xx=x0;xx<=x1;xx++)for(let yy=y0;yy<=y1;yy++){
        const id=xx+','+yy;
        if(seen.has(id))continue;
        seen.add(id);let bin=cells.get(id);if(!bin){bin=[];cells.set(id,bin);}bin.push(i);
      }
    }
  }
  if(pos!==bytes.length)throw new Error('Unexpected road-network data.');
  return {points,edges,adj,cells};
}
function meters(a,b){return Math.hypot((a[1]-b[1])*LNG_M,(a[0]-b[0])*LAT_M);}
function snap(graph,p) {
  const x=Math.floor(p[1]/CELL),y=Math.floor(p[0]/CELL),visited=new Set();let best=null;
  for(let xx=x-1;xx<=x+1;xx++)for(let yy=y-1;yy<=y+1;yy++){
    for(const i of graph.cells.get(xx+','+yy)||[]) {
      if(visited.has(i))continue;
      visited.add(i);const e=graph.edges[i];
      for(let j=1;j<e.values.length;j++) {
        const a=e.values[j-1],b=e.values[j];
        const dx=(b[1]-a[1])*LNG_M,dy=(b[0]-a[0])*LAT_M;
        const length2=dx*dx+dy*dy;if(!length2)continue;
        const t=Math.max(0,Math.min(1,((p[1]-a[1])*LNG_M*dx+(p[0]-a[0])*LAT_M*dy)/length2));
        const point=[a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])],distance=meters(p,point);
        if(distance>MAX_SNAP_METERS || best&&best.distance<=distance)continue;
        best={edge:i,point,distance,ratio:(e.offsets[j-1]+t*Math.sqrt(length2))/e.geometryLength};
      }
    }
  }
  if(!best)throw new Error('No nearby public road could be verified for one of these locations.');
  return best;
}

// Binary heap of [cost, node] pairs; duplicates make cost decreases inexpensive.
class Queue {
  values=[];
  push(cost,node){
    const a=this.values,item=[cost,node];let i=a.length;a.push(item);
    while(i){const parent=(i-1)>>1;if(a[parent][0]<=cost)break;a[i]=a[parent];i=parent;}
    a[i]=item;
  }
  pop(){
    const a=this.values,first=a[0],last=a.pop();
    if(a.length){let i=0;while(i*2+1<a.length){
      let child=i*2+1;if(child+1<a.length&&a[child+1][0]<a[child][0])child++;
      if(a[child][0]>=last[0])break;a[i]=a[child];i=child;
    }a[i]=last;}
    return first;
  }
}
function addPiece(points,e,a,b,startPoint,endPoint) {
  if(!points.length)points.push(startPoint);
  const lo=Math.min(a,b)*e.geometryLength, hi=Math.max(a,b)*e.geometryLength;
  for(let k=1;k<e.values.length-1;k++){
    const j=b>=a?k:e.values.length-1-k;
    if(e.offsets[j]>lo+.0001&&e.offsets[j]<hi-.0001)points.push(e.values[j]);
  }
  const previous=points.at(-1);
  if(previous[0]!==endPoint[0]||previous[1]!==endPoint[1])points.push(endPoint);
}

export function routeOnGraph(graph,origin,destination) {
  const start=snap(graph,origin),end=snap(graph,destination);
  const first=graph.edges[start.edge],last=graph.edges[end.edge];
  // A signed edge identifier encodes its direction. Partial endpoint costs respect one-way travel.
  const count=graph.points.length,dist=new Float64Array(count).fill(Infinity);
  const previous=new Int32Array(count),queue=new Queue();
  function seed(node,cost){if(cost<dist[node]){dist[node]=cost;queue.push(cost,node);}}
  if(start.ratio<1e-7)seed(first.from,0);
  if(start.ratio>1-1e-7)seed(first.to,0);
  if(first.direction&1)seed(first.to,(1-start.ratio)*first.ft);
  if(first.direction&2)seed(first.from,start.ratio*first.tf);
  const targets=new Map();
  function target(node,cost){if(cost<(targets.get(node)??Infinity))targets.set(node,cost);}
  if(end.ratio<1e-7)target(last.from,0);
  if(end.ratio>1-1e-7)target(last.to,0);
  if(last.direction&1)target(last.from,end.ratio*last.ft);
  if(last.direction&2)target(last.to,(1-end.ratio)*last.tf);
  let best=Infinity,finish=-1,direct=false;
  if(start.edge===end.edge) {
    const d=end.ratio-start.ratio;
    if(Math.abs(d)<1e-7 || (d>0?first.direction&1:first.direction&2)){
      best=Math.abs(d)*(d>=0?first.ft:first.tf);direct=true;
    }
  }
  while(queue.values.length){
    const [cost,node]=queue.pop();
    if(cost>=best)break;
    if(cost!==dist[node])continue;
    if(targets.has(node)&&cost+targets.get(node)<best){best=cost+targets.get(node);finish=node;direct=false;}
    for(const signed of graph.adj[node]){
      const e=graph.edges[Math.abs(signed)-1],to=signed>0?e.to:e.from,next=cost+(signed>0?e.ft:e.tf);
      if(next>=best||next>=dist[to])continue;
      dist[to]=next;previous[to]=signed;queue.push(next,to);
    }
  }
  if(!Number.isFinite(best))throw new Error('A connected public driving route could not be verified.');
  const coordinates=[];let distanceMeters=0;
  function piece(e,a,b,p,q){addPiece(coordinates,e,a,b,p,q);distanceMeters+=Math.abs(b-a)*e.metres;}
  if(direct)piece(first,start.ratio,end.ratio,start.point,end.point);
  else{
    let node=finish;const path=[];
    while(previous[node]){const signed=previous[node],e=graph.edges[Math.abs(signed)-1];path.push(signed);node=signed>0?e.from:e.to;}
    piece(first,start.ratio,node===first.from?0:1,start.point,graph.points[node]);
    for(const signed of path.reverse()){
      const e=graph.edges[Math.abs(signed)-1],forward=signed>0;
      piece(e,forward?0:1,forward?1:0,graph.points[forward?e.from:e.to],graph.points[forward?e.to:e.from]);
    }
    piece(last,finish===last.from?0:1,end.ratio,graph.points[finish],end.point);
  }
  if(coordinates.length===1)coordinates.push([...coordinates[0]]);
  return {coordinates,distanceMeters:Math.round(distanceMeters),durationSeconds:Math.round(best/10),source:'Miami-Dade County Street Network',
    startOffsetMeters:Math.round(start.distance),endOffsetMeters:Math.round(end.distance)};
}

let network;
export function loadNetwork(){
  if(!network)network=(async()=>{
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
    try{
      const res=await fetch(new URL('./miami-drive.rnet',import.meta.url),{credentials:'omit',signal:controller.signal});
      if(!res.ok)throw new Error('The county road network could not load.');
      return decodeNetwork(await res.arrayBuffer());
    }finally{clearTimeout(timer);}
  })().catch(e=>{network=undefined;throw e;});
  return network;
}
