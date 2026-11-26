import assert from 'node:assert/strict';
import {test} from 'node:test';
import {checkCurrentListing} from './current-listing.mjs';

const home = {address: '42 NW Example St', city: 'Miami', state: 'FL', zip: '33133', mls: 'OLD-ARCHIVE'};
const now = new Date('2026-11-26T12:00:00Z');
const record = {
  ListingId: 'RELISTED-42', UnparsedAddress: '42 Northwest Example Street, Miami, FL 33133',
  City: 'Miami', StateOrProvince: 'FL', PostalCode: '33133', UnitNumber: null, PropertyType: 'Residential',
  StandardStatus: 'Active', ListPrice: 400000, ModificationTimestamp: '2026-11-24T12:00:00Z',
  ListOfficeName: 'Example Brokerage', InternetEntireListingDisplayYN: true, InternetAddressDisplayYN: true
};
function options(fetchImpl) {
  return {dataset: 'miamire', token: 'private-example', now, fetchImpl};
}
function check(records, chosen = home) {
  return checkCurrentListing(chosen, options(() => Response.json({value: records})));
}
function unknown(result, reason) {
  for (const field of [result.saleStatus, result.askingPriceUsd]) {
    assert.equal(field.verification, 'unverified');
    assert.equal(field.value, null);
    assert.equal(field.reason, reason);
  }
}

test('exact relisting observed through the fixed Bridge API, with independent source and retrieval dates', async () => {
  const result = await checkCurrentListing(home, options((url, init) => {
    assert.equal(url.origin + url.pathname, 'https://api.bridgedataoutput.com/api/v2/OData/miamire/Property');
    assert.match(url.searchParams.get('$filter'), /StreetNumber eq '42' and PostalCode eq '33133'/);
    assert.ok(!url.href.includes(home.mls));
    assert.ok(!url.href.includes('private-example'));
    assert.equal(init.headers.Authorization, 'Bearer private-example');
    assert.equal(init.redirect, 'error');
    assert.equal(init.cache, 'no-store');
    return Response.json({value: [record]});
  }));
  assert.equal(result.saleStatus.value, 'Active');
  assert.equal(result.askingPriceUsd.value, record.ListPrice);
  assert.equal(result.listingId, 'RELISTED-42');
  assert.equal(result.listingOffice, record.ListOfficeName);
  for (const field of [result.saleStatus, result.askingPriceUsd]) {
    assert.equal(field.verification, 'verified');
    assert.equal(field.checkedAt, now.toISOString());
    assert.equal(field.sourceUpdatedAt, '2026-11-24T12:00:00.000Z');
    assert.equal(new URL(field.sourceUrl).searchParams.get('$filter'), "ListingId eq 'RELISTED-42'");
  }
  assert.ok(!JSON.stringify(result).includes('private-example'));
  assert.equal((await check([record], {address: home.address, zip: home.zip})).saleStatus.value, 'Active');
});

test('home, ZIP and unit must match; multiple exact matches are ambiguous', async () => {
  for (const changes of [{PostalCode:'33134'}, {City:'Tampa'}, {StateOrProvince:'GA'}, {UnitNumber:'2'},
    {UnparsedAddress:'42 NW Other St'}, {UnparsedAddress:'42 NW Example St #2'}, {PropertyType:'Residential Lease'},
    {StandardStatus:'Closed'}, {InternetEntireListingDisplayYN:false}, {InternetAddressDisplayYN:null}]) {
    unknown(await check([{...record, ...changes}]), 'no_exact_current_listing');
  }
  unknown(await check([]), 'no_exact_current_listing');
  unknown(await check([record, {...record, ListingId:'SECOND'}]), 'ambiguous_listings');
  unknown(await check([record, {...record, UnitNumber:'2', ListingId:'UNIT-2'}]), 'ambiguous_listings');
  unknown(await check([record, {...record, UnparsedAddress:'42 NW Example St #2', ListingId:'UNIT-2'}]), 'ambiguous_listings');
  const unit = {...home, address: '42 NW Example St Apt 2'};
  assert.equal((await check([{...record, UnitNumber:'2'}, record], unit)).listingId, record.ListingId);
  unknown(await check([{...record, UnitNumber:'20'}], unit), 'no_exact_current_listing');
});

test('current price requires active for-sale status and a positive numeric list price', async () => {
  for (const status of ['Pending', 'Coming Soon', 'Active Under Contract']) {
    const result = await check([{...record, StandardStatus:status}]);
    assert.equal(result.saleStatus.value, status);
    assert.equal(result.askingPriceUsd.value, null);
    assert.equal(result.askingPriceUsd.reason, 'listing_not_active');
  }
  for (const price of [null, 0, -2, '400000']) {
    const result = await check([{...record, ListPrice:price}]);
    assert.equal(result.saleStatus.verification, 'verified');
    assert.equal(result.askingPriceUsd.reason, 'missing_asking_price');
  }
});

test('live unchanged listings retain their original modification date; future and undated records fail closed', async () => {
  const older = await check([{...record, ModificationTimestamp:'2026-08-19T11:59:59Z'}]);
  assert.equal(older.saleStatus.value, 'Active');
  assert.equal(older.saleStatus.sourceUpdatedAt, '2026-08-19T11:59:59.000Z');
  assert.equal(older.saleStatus.checkedAt, now.toISOString());
  assert.equal((await check([{...record, ModificationTimestamp:'2026-11-19T12:00:00Z'}])).saleStatus.value, 'Active');
  for (const date of [null, 'invalid', '2027-01-01T01:10:00Z', '2026-11-24']) {
    unknown(await check([{...record, ModificationTimestamp:date}]), 'invalid_source_date');
  }
});

test('no configured feed or unsupported input makes no request and provides the public MLS search', async () => {
  const neverFetch = () => { throw new Error('unexpected network request'); };
  for (const config of [{}, {dataset:'miamire'}, {token:'private-example'}, {dataset:'test',token:'private-example'},
    {dataset:'https://elsewhere.test/',token:'private-example'}]) {
    const result = await checkCurrentListing(home, {...config, now, fetchImpl:neverFetch});
    unknown(result, 'provider_not_configured');
    assert.equal(result.publicSearchUrl, 'https://www.sfpropertysearch.com/en');
    assert.equal(result.saleStatus.checkedAt, null);
    assert.equal(result.saleStatus.sourceUpdatedAt, null);
  }
  for (const invalid of [{address:'Street Only', zip:'33133'}, {...home, zip:"' or true"}, {...home,state:'NY'}]) {
    const result = await checkCurrentListing(invalid, options(neverFetch));
    unknown(result, 'unsupported_address');
    assert.equal(result.listingId, null);
  }
});

test('denial, timeout, malformed and incomplete responses never fall back to the archive', async () => {
  for (const fetchImpl of [() => new Response(null, {status:403}), () => new Response('not json'),
    () => Response.json({error:true}), () => { throw new Error('private-example'); }]) {
    const result = await checkCurrentListing({...home, price:700000, sourceStatus:'FOR_SALE'}, options(fetchImpl));
    unknown(result, 'provider_unavailable');
    assert.equal(result.saleStatus.checkedAt, now.toISOString());
    assert.equal(result.saleStatus.sourceUrl, null);
    assert.ok(!JSON.stringify(result).includes('private-example'));
  }
  const partial = () => Response.json({value:[record], '@odata.nextLink':'https://elsewhere.test/'});
  unknown(await checkCurrentListing(home, options(partial)), 'incomplete_results');
  unknown(await check(Array(100).fill(record)), 'incomplete_results');
  unknown(await check([{...record, ListingId:null}]), 'missing_listing_id');
});
