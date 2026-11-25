import assert from 'node:assert/strict';
import {setImmediate as flush, setTimeout as delay} from 'node:timers/promises';
import {indexRow, findProperties} from '../dist/buggy/search.js';
import {createTripPlanner} from '../dist/buggy/trip-planner.js';

// The planner uses real EventTargets, its own debounce, and its normal navigation callback.
// These are the DOM operations required to render a route with both endpoints empty.
class Element extends EventTarget {
  children = [];
  dataset = {};
  attributes = new Map();
  isConnected = true;
  value = '';
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  scrollIntoView() {}
  *descendants() {
    for (const child of this.children) {
      yield child;
      if (child instanceof Element) yield* child.descendants();
    }
  }
}
globalThis.document = {createElement: () => new Element()};

const homes = [];
const fixtures = [];
function pair(group, query, a, b, exact, zipA = '33101', zipB = '33101') {
  const rows = [[a, zipA], [b, zipB]].map(([address, zip], i) => indexRow({
    id: `qa-${group}-${fixtures.length}-${i}`, address, zip, city: 'Miami', state: 'FL'
  }));
  homes.push(...rows);
  fixtures.push({group, query, rows, exact});
}
for (let i = 0; i < 10; i++) {
  const n = 4100 + i;
  const street = `Fixture${String.fromCharCode(65 + i)}`;
  pair('direction', `${n} ${street} Lane`, `${n} NE ${street} Lane`, `${n} NW ${street} Lane`, `${n} NW ${street} Lane`);
  pair('unit', `${n} ${street} Court`, `${n} ${street} Court Unit 2A`, `${n} ${street} Court Unit 2B`, `${n} ${street} Court Unit 2B`);
  pair('number', `${n} ${street} Way`, `${n}1 ${street} Way`, `${n}2 ${street} Way`, `${n}2 ${street} Way`);
  pair('zip', `${n} ${street} Drive`, `${n} ${street} Drive`, `${n} ${street} Drive`, `${n} ${street} Drive 33102`, '33101', '33102');
}
const schools = [{id: 'qa-school-a', name: 'Fixture East School'}, {id: 'qa-school-b', name: 'Fixture West School'}];
const rank = term => findProperties(homes, {}, term);

function openPlanner(language, getHomes = rank, kind = 'home') {
  const panel = new Element();
  const calls = [];
  const planner = createTripPlanner({panel, getHomes, getSchools: () => schools, navigate: next => calls.push(next)});
  planner.render({mode: 'route', language});
  const elements = [...panel.descendants()];
  const input = elements.find(e => e.id?.endsWith('-' + kind));
  const menu = elements.find(e => e.id === input.getAttribute('aria-controls'));
  const status = elements.find(e => e.className === 'tp-input-status');
  function type(value) {
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }
  function key(value) {
    const event = Object.assign(new Event('keydown', {cancelable: true}), {key: value});
    input.dispatchEvent(event);
  }
  return {input, menu, status, calls, type, key, dispose: planner.dispose};
}

async function waitForOptions(menu) {
  for (let i = 0; i < 100 && menu.hidden; i++) await delay(10);
  assert.equal(menu.hidden, false, 'expected search suggestions to open');
}

async function exercise(fixture, index, language, ambiguous) {
  const {rows, query, exact} = fixture;
  const term = ambiguous ? query : language === 'es' ? exact.replace('Unit', 'Unidad') : exact;
  const ranked = rank(term);
  assert.deepEqual(ranked.map(r => r.id), (ambiguous ? rows : [rows[1]]).map(r => r.id), 'unexpected fixture ranking');
  const ui = openPlanner(language);
  try {
    ui.type(term);
    // Cover both timing paths for every address family.
    if ((Math.floor(index / 4) + index % 4) % 2) await waitForOptions(ui.menu);
    ui.key('Enter');
    await flush();
    if (ambiguous) {
      assert.equal(ui.calls.length, 0, 'bare Enter selected a home');
      assert.equal(ui.menu.hidden, false);
      assert.equal(ui.input.getAttribute('aria-activedescendant'), null);
      assert.equal(ui.menu.children.length, 2);
      for (const [i, option] of ui.menu.children.entries()) {
        assert.equal(option.children[0].textContent, rows[i].address);
        assert.ok(option.children[1].textContent.includes(rows[i].zip));
      }
      ui.key('Enter');
      assert.equal(ui.calls.length, 0, 'repeated Enter selected a home');
      if (Math.floor(index / 4) % 2) {
        ui.menu.children[1].dispatchEvent(new Event('click'));
      } else {
        ui.key('ArrowDown');
        ui.key('ArrowDown');
        assert.equal(ui.input.getAttribute('aria-activedescendant'), ui.menu.children[1].id);
        ui.key('Enter');
      }
    }
    assert.deepEqual(ui.calls.map(c => c.home), [rows[1].id], 'expected one navigation to the requested residence');
  } finally {
    ui.dispose();
  }
}

async function staleRequest(language, key) {
  let resolveOld;
  const old = new Promise(resolve => { resolveOld = resolve; });
  const ui = openPlanner(language, term => term === 'old' ? old : rank(term));
  try {
    ui.type('old');
    ui.key(key);
    ui.type(fixtures[0].exact);
    await waitForOptions(ui.menu);
    resolveOld(fixtures[1].rows);
    await flush();
    assert.equal(ui.calls.length, 0, 'an older request submitted the edited query');
    assert.equal(ui.input.getAttribute('aria-activedescendant'), null, 'an older arrow key highlighted an edited query');
    ui.key('Enter');
    assert.deepEqual(ui.calls.map(c => c.home), [fixtures[0].rows[1].id]);
  } finally {
    ui.dispose();
  }
}

async function dismissSelection(language) {
  const ui = openPlanner(language);
  try {
    ui.type(fixtures[0].query);
    await waitForOptions(ui.menu);
    ui.key('ArrowDown');
    assert.equal(ui.input.getAttribute('aria-activedescendant'), ui.menu.children[0].id);
    ui.key('Escape');
    assert.equal(ui.menu.hidden, true);
    assert.equal(ui.input.getAttribute('aria-activedescendant'), null);
    ui.key('Enter');
    await flush();
    assert.equal(ui.calls.length, 0, 'Escape left a candidate selected');
  } finally {
    ui.dispose();
  }
}

async function exactWithAlternatives(language, variant) {
  const query = '740 Fixture Circle';
  let candidates;
  if (variant === 'longer number') {
    candidates = [[query, '33101'], ['7401 Fixture Circle', '33101']];
  } else if (variant === 'unit') {
    candidates = [[query, '33101'], [query + ' Unit 4C', '33101']];
  } else {
    candidates = Array.from({length: 7}, (_, i) => [query, i === 6 ? '33102' : '33101']);
  }
  const catalog = candidates.map(([address, zip], i) => indexRow({id: 'edge-' + i, address, zip, city: 'Miami', state: 'FL'}));
  const search = term => findProperties(catalog, {}, term);
  assert.deepEqual(search(query).map(r => r.id), catalog.map(r => r.id), 'expected exact plus lookalike candidates');
  const ui = openPlanner(language, search);
  try {
    ui.type(query);
    ui.key('Enter');
    await flush();
    if (variant === 'longer number') {
      assert.deepEqual(ui.calls.map(c => c.home), [catalog[0].id], 'a longer house number blocked the exact address');
      return;
    }
    assert.equal(ui.calls.length, 0, 'a full street line concealed an unresolved unit or ZIP');
    assert.equal(ui.menu.hidden, false);
    assert.equal(ui.status.hidden, false, 'announce the need to select a candidate');
    assert.match(ui.status.textContent, language === 'es' ? /elige|selecciona|escoge|seleccione|elija/i : /choose|select|pick/i);
    if (variant === 'hidden zip') {
      assert.equal(ui.menu.children.length, 6);
      assert.ok(ui.menu.children.every(option => option.children[1].textContent.includes('33101')));
      ui.type(query + ' 33102');
      ui.key('Enter');
      await flush();
      assert.deepEqual(ui.calls.map(c => c.home), [catalog[6].id], 'refining by ZIP must reach the seventh record');
    }
  } finally {
    ui.dispose();
  }
}

async function schoolControl(language) {
  const ui = openPlanner(language, rank, 'school');
  try {
    ui.type('Fixture');
    ui.key('Enter');
    await flush();
    assert.deepEqual(ui.calls.map(c => c.school), [schools[0].id]);
  } finally {
    ui.dispose();
  }
}

let failures = 0;
async function checks(name, jobs) {
  const results = await Promise.allSettled(jobs);
  const errors = results.filter(r => r.status === 'rejected');
  console.log(`${name}: ${jobs.length - errors.length}/${jobs.length} passed`);
  if (errors.length) {
    failures += errors.length;
    console.error(errors[0].reason);
  }
}
for (const language of ['en', 'es']) {
  for (const ambiguous of [true, false]) {
    const label = ambiguous ? 'ambiguous' : 'unambiguous';
    await checks(`${language} ${label}`, fixtures.map((f, i) => exercise(f, i, language, ambiguous)));
  }
  await checks(`${language} obsolete Enter and ArrowDown`, ['Enter', 'ArrowDown'].map(key => staleRequest(language, key)));
  await checks(`${language} Escape`, [dismissSelection(language)]);
  for (const variant of ['longer number', 'unit', 'hidden zip']) {
    await checks(`${language} exact address + ${variant}`, [exactWithAlternatives(language, variant)]);
  }
  await checks(`${language} school Enter`, [schoolControl(language)]);
}
if (failures) process.exitCode = 1;
