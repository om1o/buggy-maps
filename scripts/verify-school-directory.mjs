import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const app = resolve(dirname(fileURLToPath(import.meta.url)), '../dist/buggy');
const data = readFileSync(resolve(app, 'data/schools.json'));
assert.deepEqual(gunzipSync(readFileSync(resolve(app, 'data/schools.json.gz'))), data);
const { schools, counts, sourceNotesFile, imageCreditsFile } = JSON.parse(data);
const notes = readFileSync(resolve(app, sourceNotesFile), 'utf8');
const credits = readFileSync(resolve(app, imageCreditsFile), 'utf8');
const ids = new Set();
const localImages = new Set();
const byType = { Public: 0, Charter: 0, Private: 0 };
const unmapped = {};
const locations = {};
let ground = 0;
let aerial = 0;
let mapped = 0;

function checkLink(value) {
  const parsed = new URL(value);
  assert(['https:', 'http:'].includes(parsed.protocol), value);
  assert(parsed.hostname.includes('.'), value);
  return parsed;
}

function checkLocalImage(src) {
  assert(/^\.\/media\/schools\/(?:preview\/)?[a-z0-9-]+\.webp$/.test(src), src);
  if (localImages.has(src)) return;
  const bytes = readFileSync(resolve(app, src));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', src);
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', src);
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, src);
  assert(bytes.length >= 200, src);
  if (src.includes('/preview/')) {
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8 ', src);
    assert.equal(bytes.readUInt16LE(26) & 0x3fff, 160, src);
    assert.equal(bytes.readUInt16LE(28) & 0x3fff, 96, src);
  }
  localImages.add(src);
}

for (const school of schools) {
  assert(!ids.has(school.id), school.id);
  ids.add(school.id);
  assert(school.name && school.state === 'FL', school.id);
  assert(Object.hasOwn(byType, school.type), school.id);
  byType[school.type]++;
  assert(Array.isArray(school.aliases) && school.aliases.every(a => typeof a === 'string'), school.id);
  checkLink(school.sourceUrl);
  if (school.website) checkLink(school.website);
  assert.equal(school.lat == null, school.lng == null, school.id);
  if (school.lat == null) {
    assert(!school.image && !school.imageFallback, school.id);
    unmapped[school.campusType] = (unmapped[school.campusType] || 0) + 1;
    continue;
  }
  mapped++;
  assert(school.address && school.city && school.zip, school.id);
  assert.equal(school.campusType, 'campus', school.id);
  assert(Number.isFinite(school.lat) && school.lat > 25.1 && school.lat < 26.05, school.id);
  assert(Number.isFinite(school.lng) && school.lng > -81.1 && school.lng < -79.98, school.id);
  assert(school.locationSource && school.imageLabel && school.imageCredit, school.id);
  locations[school.locationSource] = (locations[school.locationSource] || 0) + 1;
  checkLink(school.imageSource);
  if (school.image.startsWith('./')) checkLocalImage(school.image);
  if (school.imageLicense) {
    assert(school.imageTitle && credits.includes(school.id), school.id);
    if (school.imageLicenseUrl) checkLink(school.imageLicenseUrl);
    ground++;
    continue;
  }
  const sourceImage = school.sourceImageUrl || school.image;
  const url = checkLink(sourceImage);
  assert.equal(url.hostname, 'gisweb.miamidade.gov');
  assert(url.pathname.endsWith('/MDCImagery_WebMercator/MapServer/export'), school.id);
  assert.equal(url.searchParams.get('size'), '600,360', school.id);
  assert.equal(url.searchParams.get('bboxSR'), '4326', school.id);
  const [w, s, e, n] = url.searchParams.get('bbox').split(',').map(Number);
  assert(w < e && s < n, school.id);
  assert(Math.abs((w + e) / 2 - school.lng) < 0.000002, school.id);
  assert(Math.abs((n + s) / 2 - school.lat) < 0.000002, school.id);
  const imageHash = createHash('sha256').update(sourceImage).digest('hex').slice(0, 18);
  assert.equal(school.imageFallback, './media/schools/preview/' + imageHash + '.webp', school.id);
  checkLocalImage(school.imageFallback);
  aerial++;
}

assert.equal(counts.total, ids.size);
assert.equal(counts.mapped, mapped);
assert.equal(counts.public, byType.Public);
assert.equal(counts.charter, byType.Charter);
assert.equal(counts.private, byType.Private);
assert.equal(counts.groundPhotos, ground);
assert.equal(counts.aerials, aerial);
assert.equal(counts.aerialPreviews, aerial);
assert.deepEqual(counts.unmapped, unmapped);
assert.deepEqual(counts.locations, locations);
assert(notes.includes(counts.total.toLocaleString('en-US')));
console.log(`Verified ${ids.size} school records, ${mapped} mapped locations, ${ground} credited building photographs, ${aerial} centered aerials with same-image previews, ${localImages.size} distinct image files, source notes and gzip parity.`);
