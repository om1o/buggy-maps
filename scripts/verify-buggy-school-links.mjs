import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {lookupBuggySchool, verifiedBuggySchoolIds} from '../dist/buggy/buggy-schools.js';

const data=JSON.parse(await readFile(new URL('../dist/buggy/data/schools.json',import.meta.url),'utf8'));
const campuses=new Map(data.schools.map(row=>[row.id,row]));
const urls=new Set();
for(const id of verifiedBuggySchoolIds) {
  const campus=campuses.get(id);
  const page=lookupBuggySchool(id);
  assert.ok(campus && page?.name, id);
  assert.equal(page.zip,campus.zip,id);
  assert.equal(page.street.split(' ')[0],campus.address.split(' ')[0],id);
  assert.match(page.url,/^https:\/\/buggy\.biz\/schools\/k12\/[a-z0-9-]+$/);
  assert.ok(!urls.has(page.url),page.url);
  urls.add(page.url);
}
assert.equal(lookupBuggySchool('unknown'),null);
assert.equal(lookupBuggySchool('fl-13-7431'),null,'Palmetto has conflicting street addresses');
assert.equal(lookupBuggySchool('fl-13-6053'),null,'A shared campus does not mean a shared listing');
assert.notEqual(lookupBuggySchool('fl-private-13-0640').url,lookupBuggySchool('campus-gulliver-krutulis').url);
console.log('Verified',urls.size,'unique public Buggy campus pages, directory joins and clean booking URLs.');
