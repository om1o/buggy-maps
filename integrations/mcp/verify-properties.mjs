import assert from 'node:assert/strict';
import {test} from 'node:test';
import {compareNearbySchools, searchHomes} from './property-tools.mjs';

const base = {
  id: 'home-a', address: '10 Example Street', city: 'Miami', state: 'FL', zip: '33133',
  price: 500000, priceLabel: 'Asking price at capture', date: '2026-03-06',
  sourceUrl: 'https://example.test/listings/a', beds: 0, baths: null, sqft: 0, lat: 25.75, lng: -80.25
};
const homes = [
  {...base, id: 'home-b'}, {...base, id: 'other-zip', price: 100000, zip: '33155'}, base,
  {...base, id: 'review', price: 750000, priceLabel: 'Displayed asking price at review'},
  {...base, id: 'dated', price: 800000, priceLabel: 'Dated asking price', lat: null},
  {...base, id: 'sale', priceLabel: 'Last sale price at capture'},
  {...base, id: 'assessment', priceLabel: 'Assessed value'},
  {...base, id: 'county', priceLabel: 'County property record'},
  {...base, id: 'recorded', priceLabel: 'Recorded sale'},
  {...base, id: 'rental', priceLabel: 'Monthly asking rent'},
  {...base, id: 'missing', price: null}, {...base, id: 'zero', price: 0}, {...base, id: 'nan', price: NaN},
  {...base, id: 'withheld', withheld: true}, {...base, id: 'blank', address: ' '}
];
const campus = {id: 'school-a', name: 'Example A', type: 'Public', grades: 'PK-5', campusType: 'campus',
  lat: 25.75, lng: -80.25, sourceUrl: 'https://example.test/schools/a'};
const schools = [
  {...campus, id: 'middle', name: 'Example Middle', grades: '6-8', lng: -80.24},
  {...campus, id: 'school-b', name: 'Example B'}, campus,
  {...campus, id: 'virtual', campusType: 'virtual'}, {...campus, id: 'program', campusType: 'specialized'},
  {...campus, id: 'null-island', lat: 0, lng: 0}, {...campus, id: 'missing', lng: null}
];

test('asking prices include endpoints and exclude sale values, assessments, rentals, missing prices and withheld homes', () => {
  const result = searchHomes(homes, {zip: '33133', minPrice: 500000, maxPrice: 750000});
  assert.equal(result.totalMatches, 3);
  assert.deepEqual(result.homes.map(h => h.id), ['home-a', 'home-b', 'review']);
  assert.equal(result.priceBasis, 'archived_asking_usd');
  assert.ok(result.availabilityNote);
  const first = result.homes[0];
  assert.deepEqual([first.askingPriceUsd, first.observedOn, first.sourceUrl, first.beds, first.baths, first.sqft],
    [500000, base.date, base.sourceUrl, 0, null, null]);
  assert.equal(searchHomes(homes, {minPrice: 500000, maxPrice: 500000}).totalMatches, 2);
  assert.equal(searchHomes(homes, {maxPrice: 0}).totalMatches, 0);
  assert.equal(searchHomes(homes, {zip: '00000'}).totalMatches, 0);
});

test('ZIP-only, one-sided price queries, stable pagination and an offset beyond the end', () => {
  assert.equal(searchHomes(homes, {zip: '33133'}).totalMatches, 4);
  assert.deepEqual(searchHomes(homes, {maxPrice: 499999}).homes.map(h => h.id), ['other-zip']);
  assert.deepEqual(searchHomes(homes, {minPrice: 800000}).homes.map(h => h.id), ['dated']);
  const afterTie = searchHomes(homes, {zip: '33133', offset: 1, limit: 2});
  assert.deepEqual([afterTie.totalMatches, afterTie.offset, afterTie.homes.map(h => h.id)], [4, 1, ['home-b', 'review']]);
  assert.deepEqual(searchHomes(homes, {zip: '33133', offset: 100}).homes, []);
});

test('invalid query boundaries and pagination fail explicitly', () => {
  for (const args of [{}, {zip: '331'}, {zip: 33133}, {minPrice: -1}, {maxPrice: Infinity},
    {zip: '33133', maxPrice: null}, {minPrice: 10, maxPrice: 9}, {zip: '33133', offset: -1},
    {zip: '33133', offset: 0.5}, {zip: '33133', limit: 0}, {zip: '33133', limit: 21}]) {
    assert.throws(() => searchHomes(homes, args));
  }
});

test('comparison keeps home selection order and computes distances only for mapped physical campuses', () => {
  const result = compareNearbySchools(homes, schools, {homeIds: ['dated', 'home-a'], limit: 5});
  assert.equal(result.distanceBasis, 'straight_line_miles');
  assert.ok(result.districtLocator.startsWith('https://'));
  assert.ok(result.attendanceNote);
  assert.deepEqual(result.comparisons.map(c => c.home.id), ['dated', 'home-a']);
  assert.equal(result.comparisons[0].locationStatus, 'unavailable');
  assert.deepEqual(result.comparisons[0].schools, []);
  const mapped = result.comparisons[1];
  assert.equal(mapped.locationStatus, 'mapped');
  assert.deepEqual(mapped.schools.map(s => s.id), ['school-a', 'school-b', 'middle']);
  assert.deepEqual(mapped.schools[0], {id: campus.id, name: campus.name, type: campus.type,
    grades: campus.grades, sourceUrl: campus.sourceUrl, distanceMiles: 0});
  assert.equal(mapped.schools[2].distanceMiles, 0.62);
  for (const coords of [{lat: 0, lng: 0}, {lat: NaN}, {lat: null}, {lng: null}, {lat: 91}]) {
    assert.equal(compareNearbySchools([{...base, ...coords}], schools, {homeIds: [base.id]}).comparisons[0].locationStatus, 'unavailable');
  }
});

test('unknown, undisclosed, unpriced, duplicate and over-limit selections fail without a partial comparison', () => {
  for (const args of [{}, {homeIds: []}, {homeIds: ['home-a', 'withheld']}, {homeIds: ['home-a', 'unknown']},
    {homeIds: ['sale']}, {homeIds: ['home-a', 'home-a']}, {homeIds: ['a', 'b', 'c', 'd']},
    {homeIds: ['home-a'], limit: 6}, {homeIds: ['home-a'], limit: 0}]) {
    assert.throws(() => compareNearbySchools(homes, schools, args));
  }
});
