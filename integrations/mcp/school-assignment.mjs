import {districtSchoolLocator} from '../../dist/buggy/school-discovery.js';

const service = 'https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/';
const addresses = service + 'GeoAddress_gdb/FeatureServer/0';
const unitPoints = service + 'PaGISView_gdb/FeatureServer/0';
const schoolYear = '2026-2027';
// The three county metadata revision histories explicitly identify the 2026–27 district edition.
// Re-review an edited layer before attributing its polygons to this school year.
const layers = [
  {band: 'elementary', layer: 'Elementary', edition: 1790018185699},
  {band: 'middle', layer: 'Middle', edition: 1790032943531},
  {band: 'high', layer: 'High', edition: 1790021587044}
];
const terms = 'Miami-Dade County provides these approximate attendance boundaries for reference. Confirm enrollment, grade-specific exceptions and school choice with Miami-Dade County Public Schools.';
const streetWords = {STREET: 'ST', AVENUE: 'AVE', ROAD: 'RD', DRIVE: 'DR', COURT: 'CT', LANE: 'LN',
  TERRACE: 'TER', PLACE: 'PL', CIRCLE: 'CIR', BOULEVARD: 'BLVD', WAY: 'WAY', PARKWAY: 'PKWY',
  NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', NORTHEAST: 'NE', NORTHWEST: 'NW', SOUTHEAST: 'SE', SOUTHWEST: 'SW'};

function street(value) {
  return String(value).toUpperCase().trim().replace(/\./g, '').split(/\s+/).map(word => streetWords[word] || word).join(' ');
}

function numericRoad(value) {
  return value.replace(/\b(\d+)(ST|ND|RD|TH)\b/g, (original, n, suffix) => {
    const last = Number(n) % 100;
    const expected = last >= 11 && last <= 13 ? 'TH' : ['TH', 'ST', 'ND', 'RD'][last % 10] || 'TH';
    return suffix === expected ? n : original;
  });
}

function addressParts(home) {
  const raw = street(home.address);
  const unitPattern = /^(.*?)(?:[,\s]+(?:APARTMENT|APT|UNIT|SUITE|STE)(?:\s+|(?=#))#?\s*|\s*#\s*)([A-Z0-9][A-Z0-9-]{0,14})$/;
  const [, base, suffix] = raw.match(unitPattern) || [];
  const unitField = String(home.unit ?? '').toUpperCase().trim();
  const supplied = unitField.replace(/^(?:(?:APARTMENT|APT|UNIT|SUITE|STE)\.?\s+)?#?\s*/, '');
  const invalid = (unitField && !/^[A-Z0-9][A-Z0-9-]{0,14}$/.test(supplied)) || (suffix && supplied && suffix !== supplied);
  return {streetAddress: street((base ?? raw).trim().replace(/,$/, '')), unit: suffix || supplied, invalid,
    displayAddress: supplied && !suffix && !invalid ? home.address + ' Unit ' + supplied : home.address};
}

async function getData(url, params, fetchImpl, signal) {
  const location = new URL(url);
  location.search = new URLSearchParams({f: 'json', ...params});
  const response = await fetchImpl(location, {signal, credentials: 'omit', redirect: 'error', headers: {Accept: 'application/json'}});
  if (!response.ok || Number(response.headers.get('content-length')) > 2000000) throw new Error('County service unavailable');
  const body = await response.text();
  if (body.length > 2000000) throw new Error('County response exceeded limit');
  const data = JSON.parse(body);
  if (data.error) throw new Error('County query failed');
  return data;
}

const latitudeMetres = 111320;
const longitudeMetres = lat => latitudeMetres * Math.cos(lat * Math.PI / 180);
const safeMargin = 15; // Abstain if a 15-metre envelope touches another zone or an edge.

async function countyAddress(home, parts, fetchImpl, signal) {
  const parsed = /^([1-9]\d{0,5})\s+(.+)$/.exec(parts.streetAddress);
  if (home.state !== 'FL' || !/^\d{5}$/.test(home.zip) || !parsed) return {reason: 'A Florida street address with a house number and five-digit ZIP is required.'};
  if (parts.invalid) return {reason: 'The supplied unit is invalid or conflicts with the street address.'};
  let data, matches;
  if (parts.unit) {
    // The appraiser's site-address data stores the unit separately. Only request the situs fields and point.
    const spellings = [...new Set([parts.streetAddress, numericRoad(parts.streetAddress)])];
    const values = spellings.map(s => "'" + s.replaceAll("'", "''") + "'").join(',');
    const where = 'TRUE_SITE_ADDR_NO_UNIT IN (' + values + ") AND TRUE_SITE_UNIT='" + parts.unit +
      "' AND (TRUE_SITE_ZIP_CODE='" + home.zip + "' OR TRUE_SITE_ZIP_CODE LIKE '" + home.zip + "-%')";
    data = await getData(unitPoints + '/query', {where, outFields: 'TRUE_SITE_ADDR_NO_UNIT,TRUE_SITE_UNIT,TRUE_SITE_ZIP_CODE',
      outSR: '4326', returnGeometry: 'true', resultRecordCount: '2'}, fetchImpl, signal);
    matches = data.features?.filter(({attributes: a}) => numericRoad(street(a.TRUE_SITE_ADDR_NO_UNIT)) === numericRoad(parts.streetAddress) &&
      String(a.TRUE_SITE_UNIT).trim().toUpperCase() === parts.unit && String(a.TRUE_SITE_ZIP_CODE).split('-')[0] === home.zip);
  } else {
    data = await getData(addresses + '/query', {
      where: 'HSE_NUM=' + parsed[1] + ' AND ZIP=' + home.zip, outFields: 'HSE_NUM,SNAME,ZIP',
      outSR: '4326', returnGeometry: 'true', resultRecordCount: '100'
    }, fetchImpl, signal);
    matches = data.features?.filter(({attributes: a}) => String(a.HSE_NUM) === parsed[1] && String(a.ZIP) === home.zip &&
      numericRoad(street(a.SNAME)) === numericRoad(parsed[2]));
  }
  if (data.exceededTransferLimit || !Array.isArray(data.features)) return {reason: 'The county did not return a complete address match.'};
  if (matches.length !== 1) return {reason: parts.unit ? 'The county parcel layer did not identify one exact street address, unit and ZIP.' :
    'The county address layer did not identify one exact street address in this ZIP.'};
  const {x, y} = matches[0].geometry ?? {};
  if (data.spatialReference?.wkid !== 4326 || !Number.isFinite(x) || !Number.isFinite(y) ||
      x < -81.1 || x > -80 || y < 25.1 || y > 26) return {reason: 'The county did not return a valid local address point.'};
  if (Number.isFinite(home.lng) && Number.isFinite(home.lat) &&
      Math.hypot((home.lng - x) * longitudeMetres(y), (home.lat - y) * latitudeMetres) > 250) {
    return {reason: 'The archived map position and exact county address point disagree by more than 250 metres.'};
  }
  return {x, y};
}

// Even/odd membership accounts for holes and multipart zones. Check edge clearance in local metres.
function safelyInside({x, y}, rings) {
  if (!Array.isArray(rings) || !rings.length) return false;
  const scale = longitudeMetres(y);
  let inside = false;
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 4) return false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j], [bx, by] = ring[i];
      if (![ax, ay, bx, by].every(Number.isFinite)) return false;
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
      const dx = (bx - ax) * scale, dy = (by - ay) * latitudeMetres;
      const px = (x - ax) * scale, py = (y - ay) * latitudeMetres;
      const length2 = dx * dx + dy * dy;
      const along = length2 ? Math.max(0, Math.min(1, (px * dx + py * dy) / length2)) : 0;
      if (Math.hypot(px - along * dx, py - along * dy) <= safeMargin) return false;
    }
  }
  return inside;
}

function emptyBand(spec) {
  const sourceUrl = service + spec.layer + 'AttendanceBoundary_gdb/FeatureServer/0';
  return {band: spec.band, status: 'unverified', schoolYear: null, sourceDate: null, schoolId: null,
    schoolName: null, grades: null, sourceUrl, metadataUrl: sourceUrl + '/metadata', evidenceUrl: null, reason: null};
}

async function checkBand(spec, point, fetchImpl, signal) {
  const band = emptyBand(spec);
  try {
    const layer = await getData(band.sourceUrl, {}, fetchImpl, signal);
    if (layer.editingInfo?.dataLastEditDate !== spec.edition) {
      return {...band, reason: 'The current county layer differs from the reviewed school-year edition.'};
    }
    band.schoolYear = schoolYear;
    band.sourceDate = new Date(spec.edition).toISOString().slice(0, 10);
    const {x, y} = point;
    const dx = safeMargin / longitudeMetres(y), dy = safeMargin / latitudeMetres;
    const data = await getData(band.sourceUrl + '/query', {
      geometry: [x - dx, y - dy, x + dx, y + dy].join(','), geometryType: 'esriGeometryEnvelope',
      inSR: '4326', outSR: '4326', spatialRel: 'esriSpatialRelIntersects', resultRecordCount: '2',
      outFields: 'OBJECTID,ID,ID2,NAME,GRADES', returnGeometry: 'true', geometryPrecision: '7'
    }, fetchImpl, signal);
    if (data.spatialReference?.wkid !== 4326 || data.exceededTransferLimit || data.features?.length !== 1) {
      return {...band, reason: 'The address did not intersect one unambiguous attendance zone.'};
    }
    const {attributes: a, geometry} = data.features[0];
    if (!safelyInside(point, geometry?.rings)) return {...band, reason: 'The address is outside the polygon or too close to an attendance boundary.'};
    if (!a?.NAME?.trim() || !a.GRADES?.trim() || !/^\d{1,4}$/.test(String(a.ID).trim()) ||
        !Number(a.ID) || Number(a.ID2) !== 0 || !Number.isSafeInteger(a.OBJECTID)) {
      return {...band, reason: 'The district record does not identify one school and grade range.'};
    }
    return {...band, status: 'matched', schoolId: String(a.ID).trim().padStart(4, '0'), schoolName: a.NAME.trim(),
      grades: a.GRADES.trim(), evidenceUrl: band.sourceUrl + '/' + a.OBJECTID};
  } catch {
    return {...band, reason: 'The county boundary service could not complete the check.'};
  }
}

export async function checkSchoolAssignment(home, {fetchImpl = fetch, now = new Date()} = {}) {
  const checkedAt = now.toISOString();
  const parts = addressParts(home);
  const result = {homeId: home.id ?? null, address: parts.displayAddress, zip: home.zip, checkedAt,
    status: 'unverified', schoolYear: null, addressStatus: 'unverified', addressSourceUrl: parts.unit ? unitPoints : addresses,
    districtLocator: districtSchoolLocator, notice: terms, bands: []};
  const signal = AbortSignal.timeout(11000);
  let point;
  try { point = await countyAddress(home, parts, fetchImpl, signal); }
  catch { point = {reason: 'The county address service could not complete the check.'}; }
  if (!point.reason) result.addressStatus = 'verified';
  const reviewedYear = checkedAt >= '2026-09-21' && checkedAt < '2027-07-01';
  if (point.reason || !reviewedYear) {
    result.bands = layers.map(spec => ({...emptyBand(spec), reason: point.reason || 'No reviewed boundary edition covers the date of this check.'}));
    return result;
  }
  result.bands = await Promise.all(layers.map(spec => checkBand(spec, point, fetchImpl, signal)));
  if (result.bands.some(b => b.schoolYear)) result.schoolYear = schoolYear;
  const count = result.bands.filter(b => b.status === 'matched').length;
  result.status = count === layers.length ? 'matched' : count ? 'partial' : 'unverified';
  return result;
}
