// The operator must have a Bridge agreement covering public display through this service.
const publicSearchUrl = 'https://www.sfpropertysearch.com/en';
const currentStatuses = ['Active', 'Active Under Contract', 'Pending', 'Coming Soon'];
const fields = ['ListingId', 'ListOfficeName', 'UnparsedAddress', 'UnitNumber', 'City', 'StateOrProvince', 'PostalCode',
  'PropertyType', 'StandardStatus', 'ListPrice', 'ModificationTimestamp', 'InternetEntireListingDisplayYN', 'InternetAddressDisplayYN'];
const aliases = {apartment:'unit', apt:'unit', suite:'unit', street:'st', avenue:'ave', road:'rd', drive:'dr',
  terrace:'ter', court:'ct', place:'pl', lane:'ln', boulevard:'blvd', circle:'cir', northwest:'nw',
  northeast:'ne', southwest:'sw', southeast:'se', north:'n', south:'s', east:'e', west:'w'};

function normalize(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase().replace(/#\s*/g, ' unit ')
    .replace(/[.,]/g, ' ').trim().split(/\s+/).map(word => Object.hasOwn(aliases, word) ? aliases[word] : word).join(' ');
}

function matchesHome(row, home) {
  if (row?.StateOrProvince !== 'FL' || row.PostalCode !== home.zip ||
      row.PropertyType !== 'Residential' || !currentStatuses.includes(row.StandardStatus) ||
      row.InternetEntireListingDisplayYN !== true || row.InternetAddressDisplayYN !== true) return false;
  const city = normalize(row.City);
  if (home.city && city !== normalize(home.city)) return false;
  const expectedStreet = normalize(home.address);
  const unit = normalize(row.UnitNumber);
  if (unit && !expectedStreet.endsWith(' unit ' + unit)) return false;
  const abbreviatedStreet = unit ? expectedStreet.slice(0, -(' unit ' + unit).length) : expectedStreet;
  const addresses = [expectedStreet, abbreviatedStreet];
  const received = normalize(row.UnparsedAddress);
  return addresses.some(address => received === address || (city && received === [address, city, 'fl', home.zip].join(' ')));
}

function fact(value, reason, checkedAt, sourceUrl = null, sourceUpdatedAt = null) {
  return {verification: value === null ? 'unverified' : 'verified', value, reason, sourceUrl, sourceUpdatedAt, checkedAt};
}

export async function checkCurrentListing(home, {dataset, token, fetchImpl = fetch, now = new Date()} = {}) {
  const result = {provider: 'MIAMI MLS via Bridge', publicSearchUrl, listingId: null, listingOffice: null};
  let checkedAt = null;
  const unknown = (reason, sourceUrl = null, sourceUpdatedAt = null) => ({
    ...result, saleStatus: fact(null, reason, checkedAt, sourceUrl, sourceUpdatedAt),
    askingPriceUsd: fact(null, reason, checkedAt, sourceUrl, sourceUpdatedAt)
  });
  if (dataset !== 'miamire' || typeof token !== 'string' || !token.trim()) return unknown('provider_not_configured');
  const number = typeof home?.address === 'string' && home.address.trim().match(/^(\d+[A-Za-z]?(?:[-/]\d+[A-Za-z]?)?)\s/);
  if (!number || typeof home.zip !== 'string' || !/^\d{5}$/.test(home.zip) || (home.state && home.state !== 'FL')) return unknown('unsupported_address');
  const endpoint = 'https://api.bridgedataoutput.com/api/v2/OData/' + dataset + '/Property';
  const url = new URL(endpoint);
  // The street number + ZIP search includes relistings under a different MLS ID.
  const statuses = currentStatuses.map(status => "StandardStatus eq '" + status + "'").join(' or ');
  url.searchParams.set('$filter', "StreetNumber eq '" + number[1] + "' and PostalCode eq '" + home.zip +
    "' and StateOrProvince eq 'FL' and PropertyType eq 'Residential' and InternetEntireListingDisplayYN eq true" +
    ' and InternetAddressDisplayYN eq true and (' + statuses + ')');
  url.searchParams.set('$select', fields.join(','));
  url.searchParams.set('$top', '100');
  checkedAt = now.toISOString();
  let page;
  try {
    const response = await fetchImpl(url, {headers: {Accept: 'application/json', Authorization: 'Bearer ' + token},
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(5000)});
    if (!response.ok) return unknown('provider_unavailable');
    page = await response.json();
  } catch {
    return unknown('provider_unavailable');
  }
  if (!Array.isArray(page?.value)) return unknown('provider_unavailable');
  if (page['@odata.nextLink'] || page.value.length >= 100) return unknown('incomplete_results');
  const matches = page.value.filter(row => matchesHome(row, home));
  if (!matches.length) return unknown('no_exact_current_listing');
  if (matches.length !== 1) return unknown('ambiguous_listings');
  if (!normalize(home.address).includes(' unit ')) {
    const otherUnit = page.value.some(row => {
      const unit = normalize(row?.UnitNumber) || normalize(row?.UnparsedAddress).match(/\bunit ([a-z0-9/-]+)/)?.[1];
      return unit && matchesHome(row, {...home, address: home.address + ' unit ' + unit});
    });
    if (otherUnit) return unknown('ambiguous_listings');
  }
  const listing = matches[0];
  if (typeof listing.ListingId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(listing.ListingId)) return unknown('missing_listing_id');
  result.listingId = listing.ListingId;
  result.listingOffice = typeof listing.ListOfficeName === 'string' ? listing.ListOfficeName : null;
  const recordUrl = new URL(endpoint);
  recordUrl.searchParams.set('$filter', "ListingId eq '" + result.listingId + "'");
  recordUrl.searchParams.set('$select', fields.join(','));
  const sourceUrl = recordUrl.href;
  const timestamp = listing.ModificationTimestamp;
  if (typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp) ||
      !Number.isFinite(Date.parse(timestamp)) || Date.parse(timestamp) > now.getTime()) return unknown('invalid_source_date', sourceUrl);
  const sourceUpdatedAt = new Date(timestamp).toISOString();
  const saleStatus = fact(listing.StandardStatus, null, checkedAt, sourceUrl, sourceUpdatedAt);
  const asking = listing.StandardStatus === 'Active' && Number.isFinite(listing.ListPrice) && listing.ListPrice > 0;
  const priceReason = listing.StandardStatus === 'Active' ? 'missing_asking_price' : 'listing_not_active';
  return {...result, saleStatus, askingPriceUsd: fact(asking ? listing.ListPrice : null, asking ? null : priceReason, checkedAt, sourceUrl, sourceUpdatedAt)};
}
