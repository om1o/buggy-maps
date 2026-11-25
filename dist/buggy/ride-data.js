import { publishableKey, supabaseUrl } from './ride-config.js';
import { isCurrentRideConfirmation } from './ride-check.js';

const validConfig = /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(supabaseUrl)
  && /^sb_publishable_[a-zA-Z0-9_-]+$/.test(publishableKey);

async function rpc(name, payload, signal) {
  signal?.throwIfAborted();
  if (!validConfig) throw new Error('The Buggy data connection is unavailable.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 10000);
  try {
    const response = await fetch(supabaseUrl + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('The Buggy data request failed.');
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('Unexpected data response.');
    return rows;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
}

export async function lookupRideCoverage({ propertyId, school, signal } = {}) {
  if (typeof propertyId !== 'string' || !propertyId || propertyId.length > 150 ||
      typeof school !== 'string' || !school.trim() || school.length > 200) return null;
  const results = await rpc('buggy_school_coverage', { p_property_id: propertyId, p_school: school }, signal);
  if (results?.length !== 1) return null;
  const r = results[0];
  if (!isCurrentRideConfirmation(r, propertyId, school)) return null;
  return { propertyId, school: r.school, status: 'confirmed', checkedAt: r.checkedAt, validUntil: r.validUntil };
}

export async function fetchMapProperties(bounds = {}, { rows = [], limit = 500, signal } = {}) {
  const { south, west, north, east } = bounds;
  if (![south, west, north, east].every(Number.isFinite) ||
      south < -90 || north > 90 || north < south || west < -180 || east > 180 || east < west) return [];
  const cap = Math.max(0, Math.min(1000, Number.isFinite(limit) ? Math.trunc(limit) : 500));
  if (!cap) return [];
  let source = rows;
  try {
    source = await rpc('buggy_properties_in_bounds', {
      p_south: south, p_west: west, p_north: north, p_east: east, p_limit: cap,
    }, signal);
  } catch {
    signal?.throwIfAborted();
  }
  const inBounds = r => r && !r.withheld && typeof r.id === 'string' && typeof r.address === 'string' && r.address.trim()
    && Number.isFinite(r.lat) && r.lat >= south && r.lat <= north
    && Number.isFinite(r.lng) && r.lng >= west && r.lng <= east;
  const points = source.filter(inBounds);
  points.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return points.slice(0, cap).map(({ id, address, city, state, zip, lat, lng }) => ({
    id, address, city, state, zip, lat, lng,
  }));
}

// ZIP-level availability is distinct from a confirmed property/school pair.
export async function lookupAreaService({zip,school,signal}={}) {
  if(!/^\d{5}$/.test(zip||'') || typeof school!=='string' || !school.trim() || school.length>200 || !validConfig) return null;
  const response=await fetch(supabaseUrl+'/rest/v1/rpc/buggy_service_area',{
    method:'POST',headers:{apikey:publishableKey,'Content-Type':'application/json'},credentials:'omit',referrerPolicy:'no-referrer',
    body:JSON.stringify({p_zip:zip,p_school:school}),signal:signal ?? AbortSignal.timeout(8000)
  });
  if(!response.ok) throw new Error('Service area lookup unavailable');
  const area=await response.json();
  return area?.zip===zip && typeof area.school==='string' && ['open','waitlist','closed'].includes(area.morning) && ['open','waitlist','closed'].includes(area.afternoon) ? area : null;
}

export async function listSchoolServiceAreas({school,signal}={}) {
  if(typeof school!=='string'||!school.trim()||school.length>200) return [];
  const areas=await rpc('buggy_school_areas',{p_school:school},signal);
  return areas.filter(area=>/^\d{5}$/.test(area?.zip) && typeof area.school==='string' &&
    ['open','waitlist','closed'].includes(area.morning) && ['open','waitlist','closed'].includes(area.afternoon));
}
