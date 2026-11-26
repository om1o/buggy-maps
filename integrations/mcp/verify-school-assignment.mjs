import assert from 'node:assert/strict';
import test from 'node:test';
import {checkSchoolAssignment} from './school-assignment.mjs';

const home = {id: null, address: '123 S.W. 10th Street', state: 'FL', zip: '33133'};
const now = new Date('2026-11-26T12:00:00Z');
const point = {x: -80.25, y: 25.75};
const square = (x, y, d) => [[x-d,y-d],[x+d,y-d],[x+d,y+d],[x-d,y+d],[x-d,y-d]];
const ring = square(point.x, point.y, .005);
const school = {attributes: {OBJECTID: 12, ID: 401, ID2: '   0', NAME: 'Example school', GRADES: 'K-8'}, geometry: {rings: [ring]}};
const addr = {attributes: {HSE_NUM: 123, SNAME: 'SW 10TH ST', ZIP: 33133}, geometry: point};
const geographic = features => ({spatialReference: {wkid: 4326}, features});
const stamps = {Elementary: 1790018185699, Middle: 1790032943531, High: 1790021587044};

function fixture(overrides = {}) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push(url);
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.credentials, 'omit');
    assert.equal(options.redirect, 'error');
    assert.equal(url.hostname, 'services.arcgis.com');
    if (url.pathname.includes('/PaGISView_')) {
      assert.equal(url.searchParams.get('outFields'), 'TRUE_SITE_ADDR_NO_UNIT,TRUE_SITE_UNIT,TRUE_SITE_ZIP_CODE');
      assert.equal(url.searchParams.get('resultRecordCount'), '2');
      return Response.json(overrides.parcels ?? geographic([]));
    }
    if (url.pathname.includes('/GeoAddress_')) {
      assert.equal(url.searchParams.get('outFields'), 'HSE_NUM,SNAME,ZIP');
      return Response.json(overrides.address ?? geographic([addr]));
    }
    const level = /\/(Elementary|Middle|High)AttendanceBoundary_/.exec(url.pathname)[1];
    if (!url.pathname.endsWith('/query')) {
      return Response.json({editingInfo: {dataLastEditDate: overrides.editions?.[level] ?? stamps[level]}});
    }
    assert.equal(url.searchParams.get('geometryType'), 'esriGeometryEnvelope');
    assert.equal(url.searchParams.get('outSR'), '4326');
    assert.equal(url.searchParams.get('resultRecordCount'), '2');
    return Response.json(overrides[level] ?? geographic([school]));
  };
  return {calls, fetchImpl};
}

test('exact address and ZIP use the county point and return dated, grade-banded boundary evidence', async () => {
  const {calls, fetchImpl} = fixture();
  const result = await checkSchoolAssignment(home, {fetchImpl, now});
  assert.equal(result.status, 'matched');
  assert.equal(result.addressStatus, 'verified');
  assert.equal(result.checkedAt, now.toISOString());
  assert.equal(result.homeId, null);
  assert.equal(result.schoolYear, '2026-2027');
  assert.equal(result.enrollmentStatus, 'unverified');
  assert.match(result.notice, /Only Miami-Dade County Public Schools can confirm student enrollment/);
  assert.equal(calls.length, 7);
  assert.equal(calls[0].searchParams.get('where'), 'HSE_NUM=123 AND ZIP=33133');
  assert.deepEqual(result.bands.map(b => b.band), ['elementary', 'middle', 'high']);
  for (const band of result.bands) {
    assert.equal(band.status, 'matched'); assert.equal(band.schoolYear, result.schoolYear);
    assert.equal(band.sourceDate, '2026-09-21'); assert.equal(band.schoolId, '0401');
    assert.equal(band.schoolName, 'Example school'); assert.equal(band.grades, 'K-8');
    assert.equal(band.metadataUrl, band.sourceUrl + '/metadata'); assert.equal(band.evidenceUrl, band.sourceUrl + '/12');
  }
});

test('the live parcel layer distinguishes an archived unit from its ambiguous building address', {skip: !process.argv.includes('--live')}, async () => {
  const {default: snapshot} = await import('./property-snapshot.json', {with: {type: 'json'}});
  const unit = snapshot.homes.find(row => row.id === 'zillow-43838862');
  const resolved = await checkSchoolAssignment(unit);
  assert.equal(resolved.status, 'matched', JSON.stringify(resolved.bands.map(b => b.reason)));
  assert.match(resolved.addressSourceUrl, /PaGISView/);
  assert.deepEqual(resolved.bands.map(b => b.schoolId), ['5001', '6841', '7461']);
  const bare = {...unit, id: null, address: unit.address.replace(/\s+APT \w+$/i, '')};
  assert.notEqual(bare.address, unit.address);
  const unresolved = await checkSchoolAssignment(bare);
  assert.equal(unresolved.addressStatus, 'unverified');
  assert.match(unresolved.bands[0].reason, /one exact street address/);
});

test('explicit units require one exact official parcel-point record and never use a bare building point', async () => {
  const parcel = {attributes: {TRUE_SITE_ADDR_NO_UNIT: '123 SW 10 ST', TRUE_SITE_UNIT: 'B', TRUE_SITE_ZIP_CODE: '33133-0000'}, geometry: point};
  for (const selection of [{address: home.address + ' APT B'}, {address: home.address + ', #B'}, {unit: 'B'}]) {
    const {calls, fetchImpl} = fixture({parcels: geographic([parcel])});
    const result = await checkSchoolAssignment({...home, ...selection}, {now, fetchImpl});
    assert.equal(result.status, 'matched'); assert.ok(result.address.endsWith('B'));
    assert.match(result.addressSourceUrl, /PaGISView_gdb/);
    const where = calls[0].searchParams.get('where');
    assert.ok(where.includes("'123 SW 10 ST'") && where.includes("TRUE_SITE_UNIT='B'"));
    assert.ok(calls.every(url => !url.pathname.includes('GeoAddress')));
  }
  for (const parcels of [geographic([]), geographic([parcel, parcel]), geographic([{...parcel, attributes: {...parcel.attributes, TRUE_SITE_UNIT: 'C'}}]),
    geographic([{...parcel, attributes: {...parcel.attributes, TRUE_SITE_ZIP_CODE: '33135-0000'}}]), {...geographic([parcel]), exceededTransferLimit: true}]) {
    const {calls, fetchImpl} = fixture({parcels});
    const result = await checkSchoolAssignment({...home, address: home.address + ' UNIT B'}, {now, fetchImpl});
    assert.equal(result.addressStatus, 'unverified'); assert.equal(calls.length, 1); assert.equal(result.status, 'unverified');
  }
  const {calls, fetchImpl} = fixture();
  const clash = await checkSchoolAssignment({...home, address: home.address + ' APT B', unit: 'A'}, {now, fetchImpl});
  assert.equal(clash.status, 'unverified'); assert.equal(calls.length, 0);
});

test('an absent, ambiguous, incomplete or conflicting official address never falls back to a listing pin', async () => {
  for (const address of [geographic([]), geographic([addr, addr]), {...geographic([addr]), exceededTransferLimit: true},
    geographic([{...addr, attributes: {...addr.attributes, ZIP: 33130}}]), geographic([{...addr, geometry: {x: 0, y: 0}}])]) {
    const {calls, fetchImpl} = fixture({address});
    const result = await checkSchoolAssignment({...home, lat: point.y, lng: point.x}, {fetchImpl, now});
    assert.equal(result.status, 'unverified'); assert.equal(result.addressStatus, 'unverified'); assert.equal(calls.length, 1);
    assert.ok(result.bands.every(b => b.reason && b.schoolId === null));
  }
  const {fetchImpl} = fixture();
  const moved = await checkSchoolAssignment({...home, lat: point.y + .02, lng: point.x}, {fetchImpl, now});
  assert.equal(moved.addressStatus, 'unverified'); assert.match(moved.bands[0].reason, /disagree/);
  for (const bad of [{...home, address: 'Main St'}, {...home, state: 'GA'}, {...home, zip: "33133 OR 1=1"}]) {
    const {calls, fetchImpl} = fixture();
    assert.equal((await checkSchoolAssignment(bad, {now, fetchImpl})).status, 'unverified');
    assert.equal(calls.length, 0);
  }
});

test('overlap, holes, edges, offshore points, alternate schools and incomplete polygons cannot count as a match', async () => {
  for (const features of [[], [school, school], [{...school, geometry: {rings: [ring, square(point.x, point.y, .002)]}}],
    [{...school, geometry: {rings: [square(point.x + .00495, point.y, .005)]}}],
    [{...school, geometry: {rings: [square(point.x + .01, point.y, .002)]}}],
    [{...school, geometry: {rings: []}}], [{...school, attributes: {...school.attributes, ID2: 1777}}]]) {
    const {fetchImpl} = fixture({Middle: geographic(features)});
    const result = await checkSchoolAssignment(home, {now, fetchImpl});
    assert.equal(result.status, 'partial'); assert.equal(result.bands[1].status, 'unverified');
    assert.equal(result.bands[1].schoolId, null); assert.ok(result.bands[1].reason);
  }
  const {fetchImpl} = fixture({Middle: geographic([{...school, geometry: {rings: [square(point.x + 1, point.y, .1), ring]}}])});
  assert.equal((await checkSchoolAssignment(home, {now, fetchImpl})).status, 'matched');
});

test('future editions, expired years and service failures return an explicit unresolved result', async () => {
  const {calls, fetchImpl} = fixture({editions: {Middle: stamps.Middle + 1}, High: {error: {code: 503}}});
  const result = await checkSchoolAssignment(home, {now, fetchImpl});
  assert.equal(result.status, 'partial');
  assert.equal(result.bands[1].schoolYear, null); assert.match(result.bands[1].reason, /edition/);
  assert.match(result.bands[2].reason, /could not complete/); assert.equal(calls.length, 6);
  const expired = await checkSchoolAssignment(home, {now: new Date('2027-07-01T00:00:00Z'), fetchImpl});
  assert.equal(expired.status, 'unverified'); assert.equal(expired.schoolYear, null);
  const unavailable = await checkSchoolAssignment(home, {now, fetchImpl: async () => { throw new Error('Unavailable'); }});
  assert.equal(unavailable.status, 'unverified'); assert.match(unavailable.bands[0].reason, /address service/);
});

// Opt in with node verify-school-assignment.mjs --live. The published listing is selected by ID.
test('official live address and polygons agree with the county Community Services point-in-polygon service', {skip: !process.argv.includes('--live')}, async () => {
  const {default: snapshot} = await import('./property-snapshot.json', {with: {type: 'json'}});
  const subject = snapshot.homes.find(row => row.id === 'zillow-43858419');
  const result = await checkSchoolAssignment(subject);
  assert.equal(result.status, 'matched', JSON.stringify(result.bands.map(b => b.reason)));
  assert.deepEqual(result.bands.map(b => b.schoolId), ['5561', '6741', '7071']);
  const direct = await checkSchoolAssignment({address: subject.address, zip: subject.zip, state: subject.state});
  assert.equal(direct.status, 'matched'); assert.equal(direct.homeId, null);
  assert.deepEqual(direct.bands, result.bands);
  const addressQuery = new URL(result.addressSourceUrl + '/query');
  const [, number, road] = /^(\d+) ([\w ]+)$/.exec(subject.address);
  addressQuery.search = new URLSearchParams({where: "HSE_NUM=" + number + " AND ZIP=" + subject.zip + " AND SNAME='" + road.toUpperCase() + "'",
    returnGeometry: 'true', outSR: '4326', outFields: 'HSE_NUM', f: 'json'});
  const addressResponse = await fetch(addressQuery, {signal: AbortSignal.timeout(8000)});
  const addressData = await addressResponse.json();
  assert.equal(addressData.features.length, 1);
  const {x, y} = addressData.features[0].geometry;
  for (const [i, layer] of [9, 11, 10].entries()) {
    const other = new URL('https://gisweb.miamidade.gov/arcgis/rest/services/CommunityServices/MD_Educational/MapServer/' + layer + '/query');
    const field = 'psde2.MDC.' + ['Elementary','Middle','High'][i] + 'AttendanceBoundary.ID';
    other.search = new URLSearchParams({f: 'json', inSR: '4326', geometry: [x, y].join(','),
      geometryType: 'esriGeometryPoint', spatialRel: 'esriSpatialRelIntersects', outFields: field, returnGeometry: 'false'});
    const response = await fetch(other, {signal: AbortSignal.timeout(8000)});
    const data = await response.json();
    assert.deepEqual(data.features.map(f => String(f.attributes[field])), [result.bands[i].schoolId]);
  }
});
