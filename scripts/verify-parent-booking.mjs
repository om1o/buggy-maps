import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {lookupBuggySchool, verifiedBuggySchoolIds} from '../dist/buggy/buggy-schools.js';
import {bookingDetails,parentBookingURL} from '../dist/buggy/parent-actions.js';

const local = 'http://example.test/buggy/';
const privateLooking = new URL(local+'?home=county-0000&schoolName=example&pickup=07:00#ride=private');
for (const id of verifiedBuggySchoolIds) {
  const url = new URL(parentBookingURL({schoolId:id,language:'es',base:privateLooking}));
  assert.equal(url.origin,privateLooking.origin);
  assert.equal(url.pathname,'/buggy/booking/');
  assert.deepEqual([...url.searchParams.keys()],['school','lang']);
  assert.equal(url.hash,'');
  const details = bookingDetails(url.search,'es');
  assert.equal(details.url,lookupBuggySchool(id).url);
  assert(details.message.includes(lookupBuggySchool(id).name));
  assert(details.confirmLabel.includes('tutor'));
  assert.equal(new URL(details.url).search,'');
}
assert.equal(new URL(parentBookingURL({schoolId:'unknown'})).hostname,'miami-homes-march-2026.aoraboracora.chatgpt.site');
assert.equal(bookingDetails('?school=unknown&url=https://example.test/&home=private','en').url,'https://buggy.biz/schools');
assert.equal(bookingDetails('?to=website&home=private','en').url,'https://buggyto.school/');
assert.equal(bookingDetails('?to=contact&school=fl-13-0841','en').url,'https://buggyto.school/contact');
assert.equal(bookingDetails('?to=https://invalid.test/&school=county-0000','en').url,'https://buggy.biz/schools');
assert.equal(new URL(parentBookingURL({schoolId:'county-0000',destination:'finder',language:'xx',base:privateLooking})).search,'');
assert.equal(new URL(parentBookingURL({destination:'website',base:privateLooking})).hash,'');
for(const file of ['booking/index.html','service/index.html']){
  const html=await readFile(new URL('../dist/buggy/'+file,import.meta.url),'utf8');
  assert.match(html,/<meta name="referrer" content="no-referrer">/);
  assert.doesNotMatch(html,/href="(?:https?:\/\/[^"]*(?:buggy\.biz|buggyto\.school)|mailto:)/);
}
const service=await readFile(new URL('../dist/buggy/service/service.js',import.meta.url),'utf8');
assert.doesNotMatch(service,/request_pickup|request_home|intake_open/);
assert.match(service,/openOperator\(\)/);
const ride=await readFile(new URL('../dist/buggy/ride-check.js',import.meta.url),'utf8');
assert.doesNotMatch(ride,/mailto:/);
console.log('Verified 32 official campus handoffs, generic/contact destinations, privacy parameters, legacy inquiry routing and no-referrer pages.');
