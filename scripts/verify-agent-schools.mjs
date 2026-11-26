import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

const {values} = parseArgs({options: {directory: {type: 'string'}}});
const cli = fileURLToPath(new URL('./agent-schools.mjs', import.meta.url));
const schema = JSON.parse(await readFile(new URL('../dist/buggy/agent-tools.json', import.meta.url), 'utf8'));
const folder = await mkdtemp(join(tmpdir(), 'buggy-school-cli-'));
const fixture = join(folder, 'schools.json');
let checks = 0;
function invoke(args, status = 0) {
  const result = spawnSync(process.execPath, ['--permission', '--allow-fs-read=*', cli, ...args], {encoding: 'utf8', timeout: 15000});
  if (result.error) throw result.error;
  assert.equal(result.status, status, result.stderr || result.stdout);
  assert.equal(status ? result.stdout : result.stderr, '');
  const output = JSON.parse(status ? result.stderr : result.stdout);
  if (status) {
    assert.deepEqual(Object.keys(output), ['error']);
    assert.ok(output.error);
  }
  checks++;
  return output;
}
const catalog = Array.from({length: 8}, (_, i) => ({
  id: 'fl-13-' + (9000 + i), name: 'Fixture Academy ' + i, campusType: 'campus', type: 'Public', grades: 'PK-5',
  address: (100 + i) + ' NW Fixture St', city: 'Miami', state: 'FL', zip: '33101', website: 'https://example.org/',
  sourceUrl: 'https://example.org/directory', lat: null, lng: null, internalNote: 'private-fixture-data'
}));
catalog[1].aliases = ['Academia Ejemplo'];
catalog[1].website = 'javascript:alert(1)';
catalog.push({...catalog[0], id: 'fl-13-9010', campusType: 'virtual'}, {...catalog[0], id: 'fl-13-9011', campusType: 'specialized'});
try {
  await writeFile(fixture, JSON.stringify({schools: catalog}));
  const run = (args, status) => invoke([...args, '--directory', fixture], status);
  const found = run(['search', '--query', '33101']);
  assert.deepEqual(Object.keys(found).sort(), schema.$defs.searchResult.required.toSorted());
  assert.equal(found.schools.length, 6);
  const all = run(['search', '--query', 'Fixture', '--limit', '20']);
  assert.equal(all.schools.length, 8);
  for (const school of all.schools) assert.deepEqual(Object.keys(school).sort(), schema.$defs.school.required.toSorted());
  assert.deepEqual(run(['search', '--query', 'Absent Terminology']).schools, []);
  for (const query of ['!!!', '— 🚲']) {
    assert.deepEqual(run(['search', '--query', query]).schools, []);
  }
  assert.equal(run(['search', '--query', 'Académia Ejémplo']).schools[0].id, catalog[1].id);
  const spanish = run(['search', '--query', 'Academia Ejemplo', '--language', 'es', '--limit', '1']);
  assert.equal(spanish.language, 'es');
  assert.equal(spanish.schools[0].id, catalog[1].id);
  assert.equal(spanish.schools[0].website, '');
  const ids = [catalog[2].id, catalog[0].id, catalog[1].id];
  for (const lng of ['en', 'es']) {
    for (const size of [1, 2, 3]) {
      const selection = ids.slice(0, size);
      const brief = run(['brief', ...selection.flatMap(id => ['--school', id]), '--language', lng]);
      assert.deepEqual(Object.keys(brief).sort(), schema.$defs.briefResult.required.toSorted());
      assert.deepEqual(brief.schools.map(s => s.id), selection);
      assert.equal(brief.language, lng);
      assert.equal(brief.districtLocator, schema['x-web'].districtLocator);
      const url = new URL(brief.shareUrl);
      const idParam = size === 1 ? 'school' : 'campuses';
      assert.equal(url.origin + url.pathname, schema['x-web'].baseUrl);
      assert.equal(url.hash, '');
      assert.deepEqual([...url.searchParams.entries()], [['mode', 'schools'], [idParam, selection.join(',')], ...(lng === 'es' ? [['lang', 'es']] : [])]);
    }
  }
  for (const args of [
    ['search'], ['search', '--query', '   '], ['search', '--query', 'A', '--limit', '0'],
    ['search', '--query', 'A', '--limit', '21'], ['search', '--query', 'A', '--limit', '1.5'],
    ['search', '--query', 'A', '--language', 'fr'], ['search', '--query', 'A', '--query', 'B'],
    ['search', '--query', 'A', '--home', 'example'], ['brief'], ['brief', '--school', 'fl-13-9999'],
    ['brief', '--school', catalog[0].id, '--school', catalog[0].id],
    ['brief', '--school', 'fl-13-9010'], ['brief', '--school', 'fl-13-9011'],
    ['brief', ...catalog.slice(0, 4).flatMap(s => ['--school', s.id])],
    ['brief', '--school', catalog[0].id, '--query', 'A']
  ]) run(args, 1);
  invoke(['search', '--query', 'A', '--directory', 'https://example.org/schools.json'], 1);
  invoke(['search', '--query', 'A', '--directory', join(folder, 'missing.json')], 1);
  assert.deepEqual(JSON.parse(await readFile(fixture, 'utf8')), {schools: catalog});
  await writeFile(fixture, '{"schools":[]}');
  invoke(['search', '--query', 'A', '--directory', fixture], 1);
  await writeFile(fixture, 'malformed JSON');
  invoke(['search', '--query', 'A', '--directory', fixture], 1);
  console.log(`${checks} fixture CLI invocations passed.`);

  const snapshot = values.directory ? ['--directory', values.directory] : [];
  for (const example of schema.examples) {
    if (example.command === 'search') {
      const result = invoke(['search', '--query', example.query, '--limit', String(example.limit), '--language', example.language, ...snapshot]);
      assert.ok(result.schools.some(s => s.id === 'fl-13-0841'));
    } else {
      const result = invoke(['brief', ...example.schoolIds.flatMap(id => ['--school', id]), '--language', example.language, ...snapshot]);
      assert.equal(result.shareUrl, schema['x-web'].multipleExample);
      assert.deepEqual(result.schools.map(s => s.grades), ['PK-5', '6-8']);
    }
  }
  console.log(`Both published-directory schema examples passed. ${checks} CLI invocations passed in total.`);
} finally {
  await rm(folder, {recursive: true, force: true});
}
