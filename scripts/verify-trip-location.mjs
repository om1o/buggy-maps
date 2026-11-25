import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {currentMapParams, protectIncomingMapLocation, publicMapParams, replaceMapLocation,
        writeMapLocation, setMapHref, intentForMapLink, rememberLocalComparison,
        isDirectorySchoolId} from '../dist/buggy/trip-location.js';
import {savedParams} from '../dist/buggy/saved-places.js';

const root='https://example.test/buggy/', home='county-0141290000480', other='county-0000000000001';
const school='fl-13-0841', carver='fl-13-6071', third='fl-13-7461';
const route=new URLSearchParams({mode:'route',home,school,dir:'return',lang:'es',layer:'aerial'});
const safe='?mode=schools&school=fl-13-0841&lang=es&layer=aerial';

function tab(url=root, initialState=null) {
  let at=0;
  const entries=[{url:new URL(url),state:initialState}];
  function activate(){globalThis.location=entries[at].url;}
  globalThis.history={
    get state(){return structuredClone(entries[at].state);},
    get length(){return entries.length;},
    pushState(state,title,value){entries.splice(at+1,entries.length,{url:new URL(value,location.href),state:structuredClone(state)});at++;activate();},
    replaceState(state,title,value){entries[at]={url:new URL(value,location.href),state:structuredClone(state)};activate();},
    back(){if(at>0)at--;activate();}, forward(){if(at<entries.length-1)at++;activate();}
  };
  activate();
}

function sameParams(left,right){assert.deepEqual(Object.fromEntries(left),Object.fromEntries(right));}
function localHome(){return currentMapParams().get('home');}
tab();
writeMapLocation(route);
assert.equal(location.search,safe);
assert.equal(localHome(),home);
sameParams(currentMapParams(),route);
assert.equal(history.length,2);
writeMapLocation(route);
assert.equal(history.length,2);
assert.equal(currentMapParams(location.search,null).get('home'),null);
assert.equal(currentMapParams(location.search,null).get('mode'),'schools');
const alternate=new URLSearchParams(route);alternate.set('home',other);
writeMapLocation(alternate);
assert.equal(history.length,3);assert.equal(location.search,safe);assert.equal(localHome(),other);
history.back();assert.equal(localHome(),home);
history.forward();assert.equal(localHome(),other);
tab(location.href,history.state);protectIncomingMapLocation();assert.equal(localHome(),other);
const staleState=history.state;
assert.equal(currentMapParams('?mode=schools&school='+carver,staleState).has('home'),false);
const skin=new URL(location.href);skin.searchParams.set('lang','en');
history.replaceState(history.state,'',skin);
assert.equal(localHome(),other);assert.equal(currentMapParams().get('lang'),'en');
const current=currentMapParams();current.delete('layer');replaceMapLocation(current);
assert.equal(location.search,'?mode=schools&school='+school+'&lang=en');
assert.equal(currentMapParams().has('layer'),false);assert.equal(localHome(),other);
history.pushState({...history.state,buggySavedPlaces:true},'',location.href);
assert.equal(localHome(),other);
history.back();assert.equal(localHome(),other);
writeMapLocation(new URLSearchParams(location.search));
assert.equal(localHome(),null);
history.back();assert.equal(localHome(),other);
const old=location.href;
tab(old);assert.equal(localHome(),null);

const legacy=new URLSearchParams({mode:'route',home,compare:[school,carver].join(','),slots:'1,3',dir:'return',lang:'es',layer:'aerial'});
tab(root+'?'+legacy+'#private-address');
protectIncomingMapLocation();
sameParams(currentMapParams(),legacy);
assert.equal(location.search,'?mode=route&lang=es&layer=aerial');
assert.equal(location.hash,'');
assert.equal(history.length,1);
assert.equal(currentMapParams(location.search,null).has('compare'),false);

for(const params of [
  new URLSearchParams({map:home}),new URLSearchParams({property:home,school}),
  new URLSearchParams({q:'3744 Stewart Ave',area:'private area',page:2,home}),
  savedParams({kind:'route',home:{id:home},school:{id:school},direction:'return'},'en')
]){
  tab();writeMapLocation(params);
  sameParams(currentMapParams(),params);
  assert(!location.href.includes(home));
  for(const key of ['q','area','property','map','home','dir','compare'])assert(!new URL(location.href).searchParams.has(key));
}

const polluted=new URLSearchParams({mode:'route',campuses:[home,school,'3744-stewart-ave',carver,school].join(','),home,
   property:home,school,compare:school,area:'private area',q:'3744 Stewart Ave',dir:'return',
   slots:'1,3',lang:'es',layer:'aerial',tracking:'discard'});
tab(root+'?'+polluted+'#private',staleState);protectIncomingMapLocation();
assert.equal(location.hash,'');
sameParams(new URL(location.href).searchParams,new URLSearchParams({mode:'schools',campuses:[school,carver].join(','),lang:'es',layer:'aerial'}));
assert.equal(currentMapParams().has('home'),false);
assert.equal(history.state?.buggyLocalMapV1,undefined);
tab(root+'?mode=schools&campuses=%3Cinvalid%3E&home='+home);
protectIncomingMapLocation();assert.equal(location.search,'?mode=schools&campuses=');
tab(root+'?mode=schools&school='+home+'#private');
protectIncomingMapLocation();assert.equal(location.search,'?mode=schools');assert.equal(location.hash,'');
tab(root+'?mode=schools&school='+school+'&school='+home);
protectIncomingMapLocation();assert.equal(location.search,'?mode=schools&school='+school);
const directory=JSON.parse(await readFile(new URL('../dist/buggy/data/schools.json',import.meta.url),'utf8'));
assert(directory.schools.length>0&&directory.schools.every(row=>isDirectorySchoolId(row.id)));
for(const id of [home,'3744-stewart-ave','fl-13-0841#private','campus-'+'x'.repeat(81)])assert.equal(isDirectorySchoolId(id),false);
const link={setAttribute(key,value){this[key]=value;}};
setMapHref(link,route);
assert.equal(link.href,safe);sameParams(intentForMapLink(link,new URL(link.href,root).search),route);
const externalCopy=new URL(link.href,root);
assert(!externalCopy.searchParams.has('home'));
setMapHref(link,new URLSearchParams({mode:'schools'}));
sameParams(intentForMapLink(link,''),new URLSearchParams('mode=schools'));
sameParams(publicMapParams('mode=schools&type=private&grade=middle'),new URLSearchParams('mode=schools&type=private&grade=middle'));

const choices=[{id:third,position:2},{id:carver,position:0}];
tab();writeMapLocation(route);
const originalLength=history.length;
assert(rememberLocalComparison(home,choices));
let restored=currentMapParams();
assert.equal(history.length,originalLength);
assert.equal(location.search,safe);
assert.equal(restored.get('compare'),[carver,third].join(','));
assert.equal(restored.get('slots'),'1,3');
for(const field of ['mode','home','school','dir','lang','layer'])assert.equal(restored.get(field),route.get(field));
const invalid=[[{id:school,position:3}],[{id:school,position:0},{id:carver,position:0}],
  [{id:school,position:0},{id:school,position:1}],[{id:home,position:0}]];
for(const bad of invalid)assert.equal(rememberLocalComparison(home,bad),null);
assert.equal(rememberLocalComparison(other,[]),null);
assert.equal(currentMapParams().get('slots'),'1,3');
const outbound=new URLSearchParams(restored);outbound.delete('dir');writeMapLocation(outbound);
assert(rememberLocalComparison(home,[{id:school,position:0}]));
assert.equal(currentMapParams().has('slots'),false);
assert(rememberLocalComparison(home,[]));assert.equal(currentMapParams().get('compare'),'');
history.back();assert.equal(currentMapParams().get('compare'),[carver,third].join(','));
assert.equal(currentMapParams().get('slots'),'1,3');
history.forward();assert.equal(currentMapParams().get('compare'),'');
tab(location.href,history.state);protectIncomingMapLocation();
assert.equal(localHome(),home);assert.equal(currentMapParams().get('compare'),'');
assert.equal(currentMapParams().get('school'),school);
assert.equal(currentMapParams(location.search,null).has('compare'),false);
tab(location.href);assert.equal(rememberLocalComparison(home,choices),null);
tab(root+'?mode=route&home='+home);assert.equal(rememberLocalComparison(home,choices),null);
console.log('Verified private route and comparison history, primary school and slot continuity, new-tab school-only opens, reload, Back/Forward across equal URLs, language/layer changes, bookmarks, legacy trips, mixed school lists, school IDs, and long-press links.');
