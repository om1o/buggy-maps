import assert from 'node:assert/strict';
import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {handlePublicMcp} from './http.mjs';
import descriptor from '../../dist/buggy/agent-tools.json' with {type: 'json'};

// With a URL, use the published HTTP service. Otherwise use the same fetch handler in process.
const endpoint = new URL(process.argv[2] ?? 'https://local.example/mcp');
const send = process.argv[2] ? fetch : handlePublicMcp;
const anonymousFetch = (input, init) => {
  const request = new Request(input, {...init, credentials: 'omit'});
  assert.ok(!['authorization', 'cookie', 'apikey'].some(name => request.headers.has(name)));
  return send(request);
};
const client = new Client({name: 'buggy-maps-http-test', version: '1.0.0'});
try {
  const probe = await anonymousFetch(endpoint, {method: 'OPTIONS', headers: {
    origin: 'https://reader.example', 'access-control-request-method': 'POST'
  }});
  assert.ok(probe.ok);
  assert.equal(probe.headers.get('access-control-allow-origin'), '*');
  await client.connect(new StreamableHTTPClientTransport(endpoint, {fetch: anonymousFetch}));
  const listing = await client.listTools();
  assert.deepEqual(listing.tools.map(tool => tool.name).sort(), descriptor['x-mcp'].tools.toSorted());
  async function call(name, args) {
    const result = await client.callTool({name, arguments: args});
    assert.ok(!result.isError, JSON.stringify(result.content));
    return result.structuredContent;
  }
  const {datasets} = await call('list_map_datasets', {});
  assert.deepEqual(datasets.map(item => item.name).sort(), Object.keys(descriptor['x-web'].dataDownloadsRelativeToDescriptor).sort());
  const {schools} = await call('search_schools', {query: 'Coconut Grove Elementary', limit: 3});
  assert.equal(schools[0].id, 'fl-13-0841');
  for (const language of ['en', 'es']) {
    const brief = await call('build_school_brief', {schoolIds: [schools[0].id], language});
    const url = new URL(brief.shareUrl);
    assert.equal(brief.schools[0].name, schools[0].name);
    assert.equal(url.origin + url.pathname, descriptor['x-web'].baseUrl);
    assert.deepEqual([...url.searchParams], [['mode', 'schools'], ['school', schools[0].id], ...(language === 'es' ? [['lang', 'es']] : [])]);
  }
  const invalid = await client.callTool({name: 'build_school_brief', arguments: {schoolIds: ['fl-13-9999']}});
  assert.equal(invalid.isError, true);
  const query = {zip: '33133', minPrice: 500000, maxPrice: 950000, limit: 2};
  const matches = await call('search_homes', query);
  assert.equal(matches.totalMatches, 11);
  assert.equal(matches.priceBasis, 'archived_asking_usd');
  assert.deepEqual(matches.homes.map(h => [h.id, h.askingPriceUsd, h.observedOn, h.zip]), [
    ['zillow-43858419', 679990, '2026-03-06', '33133'], ['zillow-43858118', 695000, '2026-03-06', '33133']
  ]);
  for (const h of matches.homes) {
    assert.equal(h.currentAvailability, 'unverified');
    assert.equal(new URL(h.sourceUrl).protocol, 'https:');
  }
  const compared = await call('compare_nearby_schools', {homeIds: matches.homes.map(h => h.id), limit: 2});
  assert.equal(compared.distanceBasis, 'straight_line_miles');
  assert.equal(compared.attendanceAssignment, 'unverified');
  assert.equal(compared.districtLocator, descriptor['x-web'].districtLocator);
  assert.deepEqual(compared.comparisons.map(c => [c.home.id, c.schools[0].id, c.schools[0].distanceMiles]), [
    ['zillow-43858419', 'fl-private-13-9306', 0.36], ['zillow-43858118', 'fl-13-5041', 0.22]
  ]);
  assert.deepEqual((await call('search_homes', {zip: '33135', maxPrice: 348999})).homes, []);
  const facts = await call('check_home_facts', {address: '0 Test St', zip: '00000'});
  assert.equal(facts.home.id, null);
  assert.equal(facts.schoolAssignment.status, 'unverified');
  assert.equal(facts.schoolAssignment.enrollmentStatus, 'unverified');
  assert.equal(facts.schoolAssignment.bands.length, 3);
  assert.ok(facts.schoolAssignment.bands.every(b => b.schoolName === null && b.reason && b.sourceUrl));
  assert.equal(facts.listing.askingPriceUsd.verification, 'unverified');
  assert.equal(facts.listing.askingPriceUsd.value, null);
  assert.equal(facts.listing.saleStatus.value, null);
  if (process.argv.includes('--zones-2026')) {
    const zoned = await call('check_home_facts', {address:'5550 SW 87th Ave, ZIP 33165'});
    assert.deepEqual(zoned.schoolAssignment.bands.map(b => [b.schoolId, b.schoolYear, b.sourceDate]), [
      ['0441', '2026-2027', '2026-09-21'], ['6211', '2026-2027', '2026-09-21'], ['7741', '2026-2027', '2026-09-21']
    ]);
    assert.equal(zoned.schoolAssignment.enrollmentStatus, 'unverified');
    assert.ok(zoned.schoolAssignment.bands.every(b => b.status === 'matched' && b.evidenceUrl.startsWith(b.sourceUrl + '/')));
    for (const field of [zoned.listing.saleStatus, zoned.listing.askingPriceUsd]) {
      if (field.verification === 'verified') assert.ok(field.value && field.sourceUrl && field.sourceUpdatedAt && field.checkedAt);
      else assert.ok(field.value === null && field.reason);
    }
    const building = await call('check_home_facts', {address:'1800 SW 3rd St', zip:'33135'});
    assert.equal(building.schoolAssignment.status, 'unverified');
    assert.ok(building.schoolAssignment.bands.every(b => b.schoolName === null));
    console.log('2026–27 live address, zone sources, dated listing evidence or abstention, and ambiguous unit verified.');
  }
  for (const [name, args] of [['search_homes', {}], ['search_homes', {minPrice: 2, maxPrice: 1}],
    ['compare_nearby_schools', {homeIds: ['unknown-home']}], ['check_home_facts', {homeId:'missing'}],
    ['check_home_facts', {homeId:matches.homes[0].id, zip:'33133'}]]) {
    assert.equal((await client.callTool({name, arguments: args})).isError, true);
  }
  console.log(`Anonymous HTTP client passed all six tools, ${datasets.length} catalog entries, archived prices, campus distances, current-fact abstention, EN/ES briefs and invalid-input checks.`);
} finally {
  await client.close();
}
