import {districtSchoolLocator, nearestSchools} from '../../dist/buggy/school-discovery.js';

const askingLabels = new Set(['Asking price at capture', 'Displayed asking price at review', 'Dated asking price']);

function eligibleHome(row) {
  return row && !row.withheld && typeof row.id === 'string' && row.id && typeof row.address === 'string' && row.address.trim() &&
    askingLabels.has(row.priceLabel) && Number.isFinite(row.price) && row.price > 0;
}

function homeFacts(row) {
  return {
    id: row.id, address: row.address, city: row.city, state: row.state, zip: row.zip,
    askingPriceUsd: row.price, priceLabel: row.priceLabel, observedOn: row.date, sourceUrl: row.sourceUrl,
    currentAvailability: 'unverified',
    beds: Number.isFinite(row.beds) && row.beds >= 0 ? row.beds : null,
    baths: Number.isFinite(row.baths) && row.baths >= 0 ? row.baths : null,
    sqft: Number.isFinite(row.sqft) && row.sqft > 0 ? row.sqft : null
  };
}

export function searchHomes(homes, {zip, minPrice, maxPrice, offset = 0, limit = 6} = {}) {
  if (zip === undefined && minPrice === undefined && maxPrice === undefined) throw new Error('Provide a ZIP or a price bound.');
  if (zip !== undefined && (typeof zip !== 'string' || !/^\d{5}$/.test(zip))) throw new Error('ZIP must contain five digits.');
  for (const price of [minPrice, maxPrice]) {
    if (price !== undefined && (!Number.isFinite(price) || price < 0)) throw new Error('Price bounds must be nonnegative numbers.');
  }
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) throw new Error('Minimum price exceeds maximum price.');
  if (!Number.isSafeInteger(offset) || offset < 0) throw new Error('Offset must be a nonnegative integer.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error('Choose a result limit from 1 to 20.');

  const matches = homes.filter(row => eligibleHome(row) &&
    (zip === undefined || row.zip === zip) &&
    (minPrice === undefined || row.price >= minPrice) &&
    (maxPrice === undefined || row.price <= maxPrice));
  matches.sort((a, b) => a.price - b.price || a.id.localeCompare(b.id, 'en'));
  return {
    priceBasis: 'archived_asking_usd',
    availabilityNote: 'Current availability is unknown for every home in this result. The source documented an asking price on the date shown. Check the listing source for current price and availability.',
    totalMatches: matches.length, offset, homes: matches.slice(offset, offset + limit).map(homeFacts)
  };
}

// Use the Miami-area bounds used when building the map overview. Zero and missing points cannot identify a local campus.
function hasMiamiPoint(row) {
  return Number.isFinite(row?.lat) && row.lat >= 24 && row.lat <= 28 &&
    Number.isFinite(row.lng) && row.lng >= -83 && row.lng <= -78;
}

export function compareNearbySchools(homes, schools, {homeIds, limit = 3} = {}) {
  if (!Array.isArray(homeIds) || homeIds.length < 1 || homeIds.length > 3 || new Set(homeIds).size !== homeIds.length) {
    throw new Error('Choose one to three distinct home IDs returned by search_homes.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 5) throw new Error('Choose a school limit from 1 to 5.');
  const mappedSchools = schools.filter(hasMiamiPoint);
  const comparisons = homeIds.map(id => {
    const row = homes.find(home => home?.id === id);
    if (!eligibleHome(row)) throw new Error('Choose home IDs returned by search_homes.');
    const mapped = hasMiamiPoint(row);
    const nearby = mapped ? nearestSchools(row, mappedSchools, limit) : [];
    return {
      home: homeFacts(row), locationStatus: mapped ? 'mapped' : 'unavailable',
      schools: nearby.map(({school, miles}) => ({
        id: school.id, name: school.name, type: school.type, grades: school.grades,
        sourceUrl: school.sourceUrl, distanceMiles: Number(miles.toFixed(2))
      }))
    };
  });
  return {
    distanceBasis: 'straight_line_miles', attendanceAssignment: 'unverified', districtLocator: districtSchoolLocator,
    attendanceNote: 'Distances are approximate straight-line miles. Check attendance boundaries with the district and confirm enrollment with the school.',
    comparisons
  };
}
