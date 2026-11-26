import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkHomeFacts, homeFactsOutput} from './home-facts.mjs';

const now = new Date('2026-11-26T18:00:00Z');
const rows = [{id: 'archive-1', address: '5550 SW 87th Ave', zip: '33165', state: 'FL', price: 679990}];
const unavailable = {now, fetchImpl: async () => { throw Error('offline fixture'); }};

test('exact archived ID and direct address return field-specific unknowns on unavailable sources', async () => {
  for (const args of [{homeId: 'archive-1'}, {address: rows[0].address, zip: rows[0].zip},
    {address: '5550 SW 87th Ave, ZIP 33165'}, {address: '5550 SW 87th Ave, 33165'}]) {
    const result = await checkHomeFacts(rows, args, unavailable);
    assert.deepEqual(homeFactsOutput.parse(result), result);
    assert.equal(result.home.id, args.homeId ?? null);
    assert.equal(result.home.address, rows[0].address);
    assert.equal(result.home.zip, rows[0].zip);
    assert.equal(result.checkedAt, now.toISOString());
    assert.equal(result.schoolAssignment.bands.length, 3);
    assert.equal(result.schoolAssignment.enrollmentStatus, 'unverified');
    assert.ok(result.schoolAssignment.bands.every(b => b.status === 'unverified' && b.reason && b.sourceUrl));
    for (const fact of [result.listing.saleStatus, result.listing.askingPriceUsd]) {
      assert.deepEqual([fact.verification, fact.reason, fact.value, fact.checkedAt, fact.sourceUpdatedAt],
        ['unverified', 'provider_not_configured', null, null, null]);
    }
    assert.ok(!JSON.stringify(result).includes('679990'));
  }
});

test('reject ambiguous selectors, incomplete addresses, unknown IDs and caller-supplied overrides', async () => {
  const bad = [{}, {homeId:'missing'}, {homeId:'archive-1', zip:'33165'},
    {homeId:'archive-1', address:rows[0].address, zip:'33165'}, {address:rows[0].address},
    {address:'5550 SW\n87th Ave',zip:'33165'}, {address:rows[0].address,zip:'3'},
    {address: '5550 SW 87th Ave, ZIP 33165', zip: '33135'}, {address: '5550 SW 87th Ave Unit 33165'},
    {homeId:'archive-1',token:'test'}, {address:rows[0].address,zip:'33165',sourceUrl:'https://example.com'}];
  for (const args of bad) await assert.rejects(checkHomeFacts(rows, args, unavailable));
});

test('a complete numbered street and ZIP in the ID slot are checked as an address without selecting an archive row', async () => {
  const result = await checkHomeFacts(rows, {homeId:'5550 SW 87th Ave, ZIP 33165'}, unavailable);
  assert.deepEqual(result.home, {id:null, address:'5550 SW 87th Ave', zip:'33165'});
  await assert.rejects(checkHomeFacts(rows, {homeId:'5550 SW 87th Ave'}, unavailable));
  await assert.rejects(checkHomeFacts(rows, {homeId:'missing, ZIP 33165'}, unavailable));
  await assert.rejects(checkHomeFacts(rows, {homeId:'5550 SW 87th Ave, ZIP 33165', zip:'33135'}, unavailable));
});
