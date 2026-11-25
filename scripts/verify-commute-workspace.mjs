import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {comparisonURL,driveFacts,leaveBy,readComparison,routeDrawing} from '../dist/buggy/commute-workspace.js';
import {decodeNetwork,routeOnGraph} from '../dist/buggy/map-assets/road-network.js';
import {directionsLinks} from '../dist/buggy/trip-routing.js';
import {publicMapURL} from '../dist/buggy/share-link.js';

const assets=new URL('../dist/buggy/',import.meta.url);
const [network,homes,directory]=await Promise.all([
  readFile(new URL('map-assets/miami-drive.rnet',assets)).then(bytes=>decodeNetwork(bytes)),
  readFile(new URL('data/index.json',assets),'utf8').then(JSON.parse),
  readFile(new URL('data/schools.json',assets),'utf8').then(JSON.parse)
]);
const home=homes.find(row=>row.id==='county-0141290000480');
const ids=['fl-13-0841','fl-13-7461','fl-13-6071'];
const schools=ids.map(id=>directory.schools.find(row=>row.id===id));
assert(home&&schools.every(Boolean));
const pt=row=>[row.lat,row.lng];
const compared=schools.map(school=>{
  const route=routeOnGraph(network,pt(home),pt(school));
  const reverse=routeOnGraph(network,pt(school),pt(home));
  assert(driveFacts(reverse,'es'));
  assert(driveFacts(route,'en'));
  const drawing=routeDrawing(route.coordinates);
  assert.equal(drawing.points.split(' ').length,route.coordinates.length);
  assert(drawing.points.split(' ').every(pair=>{
    const [x,y]=pair.split(',').map(Number);return x>=0&&x<=280&&y>=0&&y<=148;
  }));
  assert.deepEqual(routeDrawing([...route.coordinates].reverse()).first,drawing.last);
  const link=directionsLinks(home,school);
  assert.equal(new URL(link.apple).searchParams.get('source'),pt(home).map(x=>x.toFixed(6)).join(','));
  assert.equal(new URL(link.google).searchParams.get('destination'),pt(school).map(x=>x.toFixed(6)).join(','));
  return [school.id,driveFacts(route,'en').time,driveFacts(route,'en').distance];
});
assert.equal(new Set(compared.map(row=>row[0])).size,3);
const getSchool=id=>directory.schools.find(row=>row.id===id);
const canonical=(await readFile(new URL('index.html',assets),'utf8')).match(/<link rel="canonical" href="([^"]+)"/)?.[1];
assert.equal(publicMapURL,canonical);
assert.equal(new URL(publicMapURL).protocol,'https:');
assert.equal(new URL(publicMapURL).pathname,'/buggy/');
assert(comparisonURL(publicMapURL,home,schools).startsWith(canonical+'?mode=route&'));
const unmapped=directory.schools.find(row=>row.lat===null);
const injection=ids[0].toUpperCase()+',,'+unmapped.id+',missing,'+ids[0]+','+ids[1]+',%2f,'+ids[2]+',fl-13-0961';
assert.deepEqual(readComparison(injection,getSchool).map(row=>row.id),ids);
const demo=comparisonURL('https://example.org/buggy/?arrival=08:00&private=x#secret',home,[schools[0],unmapped,...schools],{reverse:true,language:'es'});
const url=new URL(demo);
assert(!url.hash);assert.deepEqual([...url.searchParams.keys()],['mode','home','compare','dir','lang']);
assert.deepEqual(url.searchParams.get('compare').split(','),ids);
assert(!url.searchParams.has('arrival'));assert.equal(url.searchParams.get('dir'),'return');
assert.equal(comparisonURL(url,home,[unmapped,schools[0]]),'');
assert.equal(comparisonURL(url,{...home,withheld:true},schools),'');
assert.deepEqual(compared[0],['fl-13-0841','4 min','1.6 mi']);
for(const seconds of [0,1,59,60,61,187,3601]){
  assert.equal(driveFacts({durationSeconds:seconds,distanceMeters:12},'en').time,leaveBy('08:00',10,seconds).driveMinutes+' min');
}
assert(driveFacts({durationSeconds:0,distanceMeters:0},'en').time==='0 min');
assert.equal(driveFacts({distanceMeters:0},'en'),null);
assert.equal(routeDrawing([[25,-80],[NaN,-81]]),null);
assert.deepEqual(routeDrawing([[25,-80],[25,-80]]).first,[140,74]);
assert.deepEqual(leaveBy('08:00','10',187),{arrive:480,driveMinutes:4,buffer:10,departure:466,dayOffset:0});
assert.deepEqual(leaveBy('00:03',10,187),{arrive:3,driveMinutes:4,buffer:10,departure:1429,dayOffset:-1});
assert.equal(leaveBy('01:05',0,0).departure,65);
for(const invalid of [['25:10',5,60],['08:99',5,60],['8:00',5,60],['',5,60],['08:00','',60],
  ['08:00',.5,60],['08:00',-1,60],['08:00',121,60],['08:00',5,-2],['08:00',5,NaN]])assert.equal(leaveBy(...invalid),null);
console.log('Verified three live-data campus comparisons in each direction, scaled print geometry, provider links, invalid inputs, and cross-midnight leave-by calculation.');
console.log(compared);
