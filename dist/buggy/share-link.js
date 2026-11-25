import {confirmParentAction} from './parent-actions.js';
import {isDirectorySchoolId} from './trip-location.js';

// A new URL and verified directory IDs keep addresses and tab state out of school links.
export const publicMapURL = 'https://miami-homes-march-2026.aoraboracora.chatgpt.site/buggy/';

export function schoolOnlyURL(schools, language = 'en') {
  if (!Array.isArray(schools)) return '';
  const ids = [...new Set(schools.map(row => row?.id).filter(isDirectorySchoolId))].slice(0, 3);
  if (!ids.length) return '';
  const url = new URL(publicMapURL);
  url.searchParams.set('mode', 'schools');
  url.searchParams.set(ids.length === 1 ? 'school' : 'campuses', ids.join(','));
  if (language === 'es') url.searchParams.set('lang', 'es');
  return url.href;
}

const words = {
  en: {
    single: ['Share school only', 'Open school link', 'School link', 'School'],
    several: ['Share schools only', 'Open school list', 'School list link', 'School list'],
    parent: 'Include home address…', heading: 'Share the home address?',
    disclosure: (home, schools) => 'Anyone with this link can see the home at ' + home + ' and ' + schools + '.',
    confirm: 'Share exact route', exact: 'Exact route link', openExact: 'Open exact route', exactTitle: 'School drive',
    copy: 'Copy link', done: 'Done', copied: 'Link copied.', manual: 'Press and hold the selected link, or use your keyboard to copy it.'
  },
  es: {
    single: ['Compartir solo la escuela', 'Abrir enlace de la escuela', 'Enlace de la escuela', 'Escuela'],
    several: ['Compartir solo las escuelas', 'Abrir la lista de escuelas', 'Enlace de la lista de escuelas', 'Lista de escuelas'],
    parent: 'Incluir la dirección de casa…', heading: '¿Compartir la dirección de casa?',
    disclosure: (home, schools) => 'Quien tenga este enlace podrá ver la dirección ' + home + ' y ' + schools + '.',
    confirm: 'Compartir la ruta exacta', exact: 'Enlace de la ruta exacta', openExact: 'Abrir la ruta exacta', exactTitle: 'Trayecto escolar',
    copy: 'Copiar enlace', done: 'Listo', copied: 'Enlace copiado.', manual: 'Mantén pulsado el enlace seleccionado o usa el teclado para copiarlo.'
  }
};

export async function shareOnDevice(payload, browser = globalThis.navigator) {
  try {
    if (typeof browser?.share !== 'function' || (browser.canShare && !browser.canShare(payload))) return 'unavailable';
    await browser.share(payload);
    return 'opened';
  } catch (error) {
    return error?.name === 'AbortError' ? 'cancelled' : 'unavailable';
  }
}

export async function writePublicLink(url, browser = globalThis.navigator) {
  try {
    await browser.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

function button(label, className) {
  const item = document.createElement('button');
  item.type = 'button';
  item.textContent = label;
  item.className = className;
  return item;
}

// The system Print command gets a school-only sheet. Only the explicit route-card action
// prepares the separate, parent-approved itinerary.
const printSources = new Set();
function prepareSchoolPrint() {
  const host = document.getElementById('school-print');
  if (!host || document.body.classList.contains('cw-printing')) return;
  const es = document.documentElement.lang === 'es';
  const list = host.querySelector('ul');
  list.replaceChildren();
  let selected = [];
  for (const source of printSources) {
    if (!source.trigger.isConnected || source.trigger.closest('details:not([open]),[hidden]')) continue;
    const rows = source.getSchools().filter(row => schoolOnlyURL([row]));
    if (rows.length > selected.length) selected = rows.slice(0, 3);
  }
  for (const school of selected) {
    const item = document.createElement('li');
    const name = document.createElement('strong');
    name.textContent = school.name;
    const address = document.createElement('span');
    address.textContent = [school.address, school.city, school.state, school.zip].filter(Boolean).join(' ');
    item.append(name, address);
    list.append(item);
  }
  host.querySelector('h1').textContent = selected.length ? (es ? 'Tus escuelas' : 'Your schools') : 'Buggy Maps';
  host.querySelector('p').textContent = es ? 'Mapa de escuelas de Miami-Dade' : 'Miami-Dade school map';
  const link = host.querySelector('a');
  link.href = schoolOnlyURL(selected, es ? 'es' : 'en') || publicMapURL;
  link.textContent = link.href;
  host.lang = es ? 'es' : 'en';
}
if (typeof window !== 'undefined') window.addEventListener('beforeprint', prepareSchoolPrint);

let nextId = 0;
export function publicSharing({kind, language = 'en', getSchools, getExactURL, homeAddress, signal}) {
  const t = language === 'es' ? words.es : words.en;
  const labels = kind === 'comparison' || kind === 'schools' ? t.several : t.single;
  const trigger = button(labels[0], 'tp-share');
  const parentTrigger = button(t.parent, 'tp-link tp-share-parent');
  const open = document.createElement('a');
  open.className = 'tp-link tp-public-link';
  open.textContent = labels[1];
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  const panel = document.createElement('div');
  panel.className = 'tp-share-options';
  panel.id = 'buggy-share-options-' + ++nextId;
  trigger.setAttribute('aria-controls', panel.id);
  parentTrigger.setAttribute('aria-haspopup', 'dialog');
  parentTrigger.setAttribute('aria-controls', panel.id);

  const field = document.createElement('input');
  field.className = 'tp-input';
  field.type = 'text';
  field.readOnly = true;
  field.inputMode = 'none';
  field.addEventListener('click', () => field.select());
  const exactOpen = open.cloneNode(false);
  exactOpen.className = 'tp-link tp-exact-open';
  exactOpen.textContent = t.openExact;
  const copy = button(t.copy, 'tp-secondary');
  const done = button(t.done, 'tp-link');
  const actions = document.createElement('div');
  actions.className = 'cw-route-actions';
  actions.append(copy, done);
  const status = document.createElement('span');
  status.className = 'tp-fine tp-share-status';
  status.setAttribute('role', 'status');

  let schoolURL, exactURL, activeURL = '', activeTrigger = trigger, revision = 0, pendingChoice, sharingNow = false;
  function close() {
    revision++;
    sharingNow = false;
    pendingChoice?.abort();
    pendingChoice = null;
    activeURL = '';
    field.value = '';
    exactOpen.removeAttribute('href');
    panel.hidden = true;
    panel.replaceChildren();
    status.textContent = '';
    trigger.setAttribute('aria-expanded', 'false');
  }
  function refresh() {
    const nextSchool = schoolOnlyURL(getSchools(), language);
    const nextExact = nextSchool && getExactURL ? getExactURL() || '' : '';
    if (nextSchool !== schoolURL || nextExact !== exactURL) {
      close();
      schoolURL = nextSchool;
      exactURL = nextExact;
      trigger.disabled = !schoolURL;
      open.hidden = !schoolURL;
      if (schoolURL) open.href = schoolURL;
      else open.removeAttribute('href');
      parentTrigger.hidden = !exactURL;
      parentTrigger.disabled = !exactURL;
    }
    return schoolURL;
  }
  function selectField() {
    field.focus({preventScroll:true});
    field.select();
    field.setSelectionRange?.(0, field.value.length);
  }
  function dismiss() {
    const returnTo = activeTrigger;
    close();
    returnTo.focus({preventScroll:true});
  }
  async function share(exact) {
    if (signal.aborted || !refresh() || (exact && !exactURL) || sharingNow) return;
    close();
    const request = revision;
    sharingNow = true;
    activeTrigger = exact ? parentTrigger : trigger;
    activeURL = exact ? exactURL : schoolURL;
    field.value = activeURL;
    field.setAttribute('aria-label', exact ? t.exact : labels[2]);
    if (exact) exactOpen.href = activeURL;
    panel.append(field, actions, ...(exact ? [exactOpen] : []), status);
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', String(!exact));
    // Web Share must run in the initiating gesture, including on iPad.
    const result = await shareOnDevice({title: (exact ? t.exactTitle : labels[3]) + ' · Buggy Maps', url: activeURL});
    if (signal.aborted || revision !== request) return;
    sharingNow = false;
    if (result === 'unavailable') selectField();
    else if (result === 'cancelled' || exact) dismiss();
    else activeTrigger.focus({preventScroll:true});
  }
  trigger.addEventListener('click', () => share(false));
  parentTrigger.addEventListener('click', () => {
    if (signal.aborted || !refresh() || !exactURL || sharingNow) return;
    close();
    const expected = exactURL;
    pendingChoice = new AbortController();
    const names = getSchools().map(row => row.name).filter(Boolean).join(', ');
    confirmParentAction({
      language, heading:t.heading, message:t.disclosure(homeAddress, names), confirmLabel:t.confirm,
      trigger:parentTrigger, signal:pendingChoice.signal,
      onConfirm:() => {
        if (!signal.aborted && refresh() && expected === exactURL) share(true);
      }
    });
  });
  open.addEventListener('click', refresh);
  copy.addEventListener('click', async () => {
    refresh();
    if (signal.aborted || !activeURL || panel.hidden) return;
    const request = revision;
    selectField();
    const written = await writePublicLink(activeURL);
    if (!signal.aborted && request === revision) status.textContent = written ? t.copied : t.manual;
  });
  done.addEventListener('click', dismiss);
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); dismiss(); }
  });
  const printSource = {trigger, getSchools};
  printSources.add(printSource);
  window.addEventListener('buggy-basemap-change', refresh);
  signal.addEventListener('abort', () => {
    printSources.delete(printSource);
    window.removeEventListener('buggy-basemap-change', refresh);
    close();
  }, {once:true});
  refresh();
  return {trigger, parentTrigger, open, panel, refresh};
}
