const graphFile = new URL('./map-assets/route-worker.js',import.meta.url);
let worker, nextId=0, workerUnavailable=false;
const pending=new Map();

function point(row) {
  if(!row||row.withheld||row.lat===null||row.lng===null||row.lat===''||row.lng==='')return null;
  const lat=Number(row.lat),lng=Number(row.lng);
  return Number.isFinite(lat)&&Number.isFinite(lng)&&lat>24&&lat<28&&lng>-83&&lng<-78?[lat,lng]:null;
}
function endpoint(row) {
  if(!row||row.withheld)return '';
  const coordinate=point(row);
  if(coordinate)return coordinate.map(v=>v.toFixed(6)).join(',');
  if(!row.address?.trim())return '';
  return [row.address,row.city,row.state||'FL',row.zip].filter(Boolean).join(', ');
}
export function directionsLinks(origin,destination) {
  const start=endpoint(origin),end=endpoint(destination);
  if(!start||!end)return {google:'',apple:''};
  const google=new URL('https://www.google.com/maps/dir/');google.search=new URLSearchParams({api:'1',origin:start,destination:end,travelmode:'driving'});
  const apple=new URL('https://maps.apple.com/directions');apple.search=new URLSearchParams({source:start,destination:end,mode:'driving'});
  return {google:google.href,apple:apple.href};
}
function direct(origin,destination) {
  return import('./map-assets/road-network.js').then(async m=>m.routeOnGraph(await m.loadNetwork(),origin,destination));
}
function inWorker(origin,destination,signal) {
  if(!worker){
    worker=new Worker(graphFile,{type:'module'});
    worker.addEventListener('message',({data})=>{
      const job=pending.get(data.id);
      if(!job)return;
      if(data.error)job.reject(new Error(data.error));else job.resolve(data.result);
    });
    worker.addEventListener('error',()=>{
      workerUnavailable=true;worker.terminate();worker=undefined;
      for(const job of [...pending.values()])job.retry();
    });
  }
  return new Promise((resolve,reject)=>{
    const id=++nextId;
    const cleanup=()=>{pending.delete(id);signal?.removeEventListener('abort',cancel);};
    const cancel=()=>{cleanup();reject(new DOMException('Route cancelled','AbortError'));};
    pending.set(id,{
      resolve(v){cleanup();resolve(v);},reject(e){cleanup();reject(e);},
      retry(){direct(origin,destination).then(v=>{cleanup();signal?.aborted?cancel():resolve(v);},e=>{cleanup();reject(e);});}
    });
    signal?.addEventListener('abort',cancel,{once:true});
    if(signal?.aborted){cancel();return;}
    try{worker.postMessage({id,origin,destination});}catch(e){cleanup();reject(e);}
  });
}
export async function calculateDrive(home,school,{signal}={}) {
  if(signal?.aborted)throw new DOMException('Route cancelled','AbortError');
  const a=point(home),b=point(school);
  if(!a||!b)throw new Error('Verified coordinates are required for an in-app driving route.');
  if(typeof Worker==='function'&&!workerUnavailable){
    try{return await inWorker(a,b,signal);}
    catch(error){if(worker || error.name==='AbortError')throw error;workerUnavailable=true;}
  }
  const result=await direct(a,b);
  if(signal?.aborted)throw new DOMException('Route cancelled','AbortError');
  return result;
}
