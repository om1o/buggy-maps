import fs from 'node:fs';
import assert from 'node:assert/strict';
import {decodeNetwork,routeOnGraph} from '../dist/buggy/map-assets/road-network.js';
import {directionsLinks,calculateDrive} from '../dist/buggy/trip-routing.js';
import {countyTileUrl} from '../dist/buggy/map-assets/aerial.js';
const site=new URL('../dist/buggy/',import.meta.url);
const bytes=fs.readFileSync(new URL('map-assets/miami-drive.rnet',site));
const before=performance.now();const network=decodeNetwork(bytes); console.log(network.points.length,network.edges.length,Math.round(performance.now()-before)+'ms load');
const indexURL=new URL('data/index.json',site);
let h;
if(fs.existsSync(indexURL)) h=JSON.parse(fs.readFileSync(indexURL));
else { const {gunzipSync}=await import('node:zlib'); h=JSON.parse(gunzipSync(fs.readFileSync(new URL('data/index.json.gz',site)))); }
const s=JSON.parse(fs.readFileSync(new URL('data/schools.json',site))).schools;
const pt=r=>[r.lat,r.lng],sample=h.find(r=>r.address.toUpperCase().includes('3744 STEWART')),school=s.find(r=>r.name.toUpperCase()==='COCONUT GROVE ELEMENTARY SCHOOL');
assert(sample&&school);
for(const [from,to] of [[sample,school],[school,sample]]){
 const t=performance.now(),r=routeOnGraph(network,pt(from),pt(to));
 console.log(from.address||from.name,'→',to.name||to.address,r.distanceMeters,r.durationSeconds,r.coordinates.length+' vertices','offsets',r.startOffsetMeters,r.endOffsetMeters,Math.round(performance.now()-t)+'ms');
 assert(r.coordinates.length>=8);assert(r.distanceMeters>600 && r.distanceMeters<7000);assert(r.durationSeconds>40);
}
let valid=0,unroutable=0;for(let i=0;i<154;i++) {
 const home=h[(i*3539+7)%h.length],school=s[(i*487+3)%s.length];
 if(!school.lat||!home.lat)continue;
 let r;
 try{r=routeOnGraph(network,pt(home),pt(school));}catch(e){assert(/nearby public road|connected public/.test(e.message));unroutable++;continue;}
 assert(r.coordinates.length>=2);assert(r.distanceMeters>=0&&r.durationSeconds>=0);
 assert(r.coordinates.every(p=>p.length===2&&p.every(Number.isFinite)));valid++;
}console.log('actual sampled',valid,'routes;',unroutable,'beyond public network');assert(valid>80);
const one=network.edges.find(e=>e.direction===1&&e.values.length===2&&e.metres>150&&network.adj[e.from].length>=2);
const linear=t=>one.values[0].map((v,k)=>v+t*(one.values[1][k]-v));
const f=routeOnGraph(network,linear(.2),linear(.8)),b=routeOnGraph(network,linear(.8),linear(.2));
assert(Math.abs(f.distanceMeters-.6*one.metres)<2);assert(b.distanceMeters>f.distanceMeters);
console.log('one-way',f.distanceMeters,b.distanceMeters);
assert.throws(()=>routeOnGraph(network,[25.5,-80.02],pt(school)),/nearby public road/);
assert.throws(()=>decodeNetwork(bytes.subarray(0,100)),/incomplete/);
const link=directionsLinks(sample,school);assert.equal(new URL(link.google).searchParams.get('travelmode'),'driving');assert.equal(new URL(link.apple).searchParams.get('mode'),'driving');
assert.match(directionsLinks({address:'123 Main St',city:'Miami'},school).apple,/123\+Main/);assert.equal(directionsLinks({withheld:true,address:'Hidden'},school).google,'');
await assert.rejects(calculateDrive(sample,school,{signal:AbortSignal.abort()}),{name:'AbortError'});
const url=new URL(countyTileUrl({z:13,x:2270,y:3481}));assert.equal(url.searchParams.get('bboxSR'),'3857');assert.equal(url.searchParams.get('size'),'256,256');
console.log('directions, out-of-bounds, archive integrity, cancellation, aerial tests passed');
