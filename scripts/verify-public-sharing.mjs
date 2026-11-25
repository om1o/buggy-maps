import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {comparisonSlots, comparisonURL} from '../dist/buggy/commute-workspace.js';
import {publicMapURL, schoolOnlyURL, shareOnDevice, writePublicLink} from '../dist/buggy/share-link.js';

const home = {id:'county-0141290000480'};
const schools = ['fl-13-0841','fl-13-7461'].map(id=>({id,lat:25.7,lng:-80.2}));
const publicLink = schoolOnlyURL(schools,'es');
const safe = new URL(publicLink);
assert.equal(safe.origin+safe.pathname,publicMapURL);
assert.deepEqual([...safe.searchParams], [['mode','schools'],['campuses','fl-13-0841,fl-13-7461'],['lang','es']]);
assert.equal(safe.hash,'');
assert.equal(schoolOnlyURL([home,{id:'123 Main Street'},{id:'fl-13-0841&home=123'},{id:'campus-../home'},null]),'');
assert.equal(schoolOnlyURL([...schools,...schools], 'es'),publicLink);
assert.deepEqual([...new URL(schoolOnlyURL([schools[0]])).searchParams],[['mode','schools'],['school','fl-13-0841']]);
const catalog=JSON.parse(await readFile(new URL('../dist/buggy/data/schools.json',import.meta.url),'utf8')).schools;
for (const row of catalog) assert.equal(new URL(schoolOnlyURL([row])).searchParams.get('school'), row.id);
assert.equal(new URL(schoolOnlyURL(catalog)).searchParams.get('campuses').split(',').length,3);
const exactLink=comparisonURL(publicMapURL,home,schools,{language:'es',reverse:true});
const params = new URL(exactLink).searchParams;
assert.deepEqual([...params.keys()],['mode','home','compare','dir','lang']);
const keptColors = new Map([[schools[0].id,0],[schools[1].id,2]]);
const withLayer = new URL(comparisonURL(publicMapURL,home,schools,{positions:keptColors,aerial:true}));
assert.equal(withLayer.searchParams.get('layer'),'aerial');
assert.deepEqual(comparisonSlots(withLayer.searchParams.get('slots'),2),[0,2]);
assert.equal(new URL(comparisonURL(publicMapURL,home,schools,{positions:new Map([[schools[0].id,0],[schools[1].id,1]])})).searchParams.has('slots'),false);
for(const invalid of ['','0,1','1,1','3,4','1,2,3','01,02','3,1,3,1'])assert.equal(comparisonSlots(invalid,2),null);
const payload = {title:'Lista de escuelas · Buggy Maps',url:publicLink};
const received = [];
const device = {
  canShare(value) {return value.url === publicLink;},
  share(value) {received.push(value);return Promise.resolve();}
};
const sharing = shareOnDevice(payload,device);
assert.deepEqual(received,[payload], 'Share must run in the original tap, before the first await.');
assert.equal(await sharing,'opened');
assert.equal(await shareOnDevice(payload,{}),'unavailable');
assert.equal(await shareOnDevice(payload,{...device,canShare:()=>false}),'unavailable');
assert.equal(received.length,1);
assert.equal(await shareOnDevice(payload,{share:async()=>{throw new DOMException('Dismissed','AbortError');}}),'cancelled');
assert.equal(await shareOnDevice(payload,{share:async()=>{throw new DOMException('Denied','NotAllowedError');}}),'unavailable');
assert.equal(await shareOnDevice(payload,{canShare(){throw Error('Disabled');},share:device.share}),'unavailable');
const copied = [];
assert(await writePublicLink(publicLink,{clipboard:{writeText(value){copied.push(value);return Promise.resolve();}}}));
assert.deepEqual(copied,[publicLink]);
assert.equal(await writePublicLink(publicLink,{clipboard:{writeText(){return Promise.reject(new Error('Denied'));}}}),false);
assert.equal(await writePublicLink(publicLink,{}),false);
console.log('Verified 1,190 directory IDs, school-only shared and clipboard payloads, exact comparison compatibility, native share, cancellation and blocked APIs.');
