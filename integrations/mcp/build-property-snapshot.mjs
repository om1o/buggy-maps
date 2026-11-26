import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {gunzipSync, gzipSync} from 'node:zlib';
import {mergeHomeRows} from '../../dist/buggy/home-rows.js';

const map = new URL('../../dist/buggy/', import.meta.url);
const output = new URL('./property-snapshot.json', import.meta.url);
const download = new URL('data/archived-asking-homes.json.gz', map);
const readJSON = file => JSON.parse(readFileSync(file, 'utf8'));
const rows = mergeHomeRows(readJSON(new URL('data/index.json', map)), readJSON(new URL('data/gallery-homes.json', map)).homes);
const archived = readJSON(new URL('../report/records.json', map)).flatMap(group => group.records);
const captures = new Map();
const reviews = new Map();
const history = new Map();
for (const record of archived) {
  if (record.status_at_capture === 'FOR_SALE' && record.home_type === 'SINGLE_FAMILY') {
    captures.set('zillow-' + record.zpid, record);
  } else if (record.zillow_status) {
    reviews.set(record.zillow_url, record);
  } else if (record.history_event) {
    history.set(record.homescom_url + '|' + record.history_event_date, record);
  }
}

const priceLabels = new Set(['Asking price at capture', 'Displayed asking price at review', 'Dated asking price']);
function priceEvidence(row, detail, capture) {
  for (const observation of detail.observations) {
    if (observation.price !== row.price || observation.date !== row.date || !observation.url) continue;
    const url = new URL(observation.url);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) continue;
    if (row.priceLabel === 'Asking price at capture' && url.hostname === 'www.zillow.com' &&
        observation.label === 'Listed for sale at capture' && capture?.zillow_url === observation.url &&
        capture.captured_utc.slice(0, 10) === row.date && Number(capture.asking_price_usd) === row.price) {
      return {observation, sourceStatus: capture.status_at_capture};
    }
    if (row.priceLabel === 'Displayed asking price at review' && url.hostname === 'www.zillow.com') {
      const review = reviews.get(observation.url);
      if (review?.review_date === row.date && review.zillow_status === 'For sale' && Number(review.zillow_ask_usd) === row.price) {
        return {observation, sourceStatus: review.zillow_status};
      }
    }
    if (row.priceLabel === 'Dated asking price' && url.hostname === 'www.homes.com') {
      const event = history.get(observation.url + '|' + row.date);
      if (event && ['For sale', 'Price changed'].includes(event.history_event) &&
          event.history_event === observation.label && Number(event.event_price_usd) === row.price) {
        return {observation, sourceStatus: event.history_event === 'For sale' ? 'For sale' : null};
      }
    }
  }
  throw new Error('Unverified purchase asking price for ' + row.id);
}

function coordinateSource(row, capture, facts) {
  if (!Number.isFinite(row.lat) || !Number.isFinite(row.lng) ||
      row.lat < 24 || row.lat > 28 || row.lng < -83 || row.lng > -78) return null;
  if (capture && Number(capture.latitude) === row.lat && Number(capture.longitude) === row.lng) return 'Zillow archive';
  if (facts.get('Location source') === 'Miami-Dade County Parcel Points') return 'Miami-Dade County Parcel Points';
  return null;
}

const homes = [];
for (const row of rows) {
  if (row.withheld || !row.address?.trim() || !Number.isFinite(row.price) || row.price <= 0 || !priceLabels.has(row.priceLabel)) continue;
  const detail = readJSON(new URL(row.detailUrl, map));
  assert.equal(detail.id, row.id);
  const facts = new Map(detail.facts.map(fact => [fact.label, fact.value]));
  if (facts.get('Property type') !== 'Single-family' || facts.get('Listing type') === 'Builder community or plan') continue;
  const capture = captures.get(row.id);
  const {observation, sourceStatus} = priceEvidence(row, detail, capture);
  const locationSource = coordinateSource(row, capture, facts);
  homes.push({
    id: row.id, address: row.address, city: row.city, state: row.state, zip: row.zip,
    price: row.price, priceLabel: row.priceLabel, date: row.date,
    source: observation.source, sourceUrl: observation.url, priceEvent: observation.label, sourceStatus,
    beds: row.beds ?? null, baths: row.baths ?? null, sqft: row.sqft ?? null,
    lat: locationSource ? row.lat : null, lng: locationSource ? row.lng : null, locationSource
  });
}

const args = process.argv.slice(2);
const bytes = Buffer.from('{"homes":[\n' + homes.map(home => JSON.stringify(home)).join(',\n') + '\n]}\n');
if (args.length === 1 && args[0] === '--check') {
  // This real listing looks like an addressed home but the source identifies a builder plan.
  const plan = rows.find(row => row.id === 'zillow-443314370');
  const detail = readJSON(new URL(plan.detailUrl, map));
  assert.ok(detail.facts.some(fact => fact.label === 'Listing type' && fact.value === 'Builder community or plan'));
  assert.ok(!homes.some(home => home.id === plan.id), 'A builder plan appeared as an individual home');
  assert.ok(bytes.equals(readFileSync(output)), 'Snapshot differs. Run node build-property-snapshot.mjs to regenerate.');
  assert.ok(bytes.equals(gunzipSync(readFileSync(download))), 'Map download differs. Run node build-property-snapshot.mjs to regenerate.');
} else if (args.length === 0) {
  writeFileSync(output, bytes);
  writeFileSync(download, gzipSync(bytes, {level: 9}));
} else {
  throw new Error('Usage: node build-property-snapshot.mjs [--check]');
}
console.log(homes.length + ' archived homes; ' + bytes.length + ' bytes.');
