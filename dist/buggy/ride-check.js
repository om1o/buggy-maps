import { currentLanguage, localText } from './language.js';
import {confirmParentAction,parentBookingURL} from './parent-actions.js';
import {verifiedBuggySchoolIds,lookupBuggySchool} from './buggy-schools.js';

// These names are also present in the Miami property archive. Use them as choices
// for records without nearby-school data, without implying distance or service.
const miamiSchools = [
  'Coconut Grove Elementary School',
  'Coral Gables Senior High School',
  'Miami Senior High School',
  'Ponce De Leon Middle School',
  'Shenandoah Middle School'
];
const miamiCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
});
const displayDate = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric'
});
const normalizeSchool = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').toLowerCase() : '';
const officialNames = new Map([...verifiedBuggySchoolIds].map(id=>[normalizeSchool(lookupBuggySchool(id).name),id]));
let instance = 0;

function calendarDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : '';
}

function todayInMiami() {
  const parts = Object.fromEntries(miamiCalendar.formatToParts(new Date()).map(part => [part.type, part.value]));
  return [parts.year, parts.month, parts.day].join('-');
}

export function isCurrentRideConfirmation(record, propertyId, school, today = todayInMiami()) {
  if (!record || record.status !== 'confirmed' || !propertyId || record.propertyId !== propertyId) return false;
  if (!normalizeSchool(school) || normalizeSchool(record.school) !== normalizeSchool(school)) return false;
  const checked = calendarDay(record.checkedAt);
  const expires = calendarDay(record.validUntil);
  return Boolean(checked && expires && calendarDay(today) && checked <= today && today <= expires);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function schoolChoices(items) {
  const schoolNames = new Map();
  for (const item of items || []) {
    const name = typeof item === 'string' ? item : item?.name;
    const key = normalizeSchool(name);
    if (key && !schoolNames.has(key)) schoolNames.set(key, name.trim());
  }
  return [...schoolNames.values()];
}

export function mountRideCheck(container, row, options = {}) {
  const id = 'ride-check-' + (++instance);
  const scope = new AbortController();
  let request;
  let version = 0;
  let activeBooking;
  function updateBookingLabel(){
    if(activeBooking)activeBooking.textContent=currentLanguage()==='es'?'Consultar transporte con Buggy':'Check rides with Buggy';
  }
  window.addEventListener('buggy-language-change',updateBookingLabel,{signal:scope.signal});
  const card = element('section', 'ride-check');
  const heading = element('h2', 'ride-check-title', 'Check my school ride');
  heading.id = id + '-title';
  card.setAttribute('aria-labelledby', heading.id);
  card.append(heading);
  container.replaceChildren(card);

  function dispose() {
    version++;
    request?.abort();
    scope.abort();
  }

  if (!row?.address || row.withheld || !row.id) {
    const contact = element('a', 'ride-check-contact', 'Contact Buggy');
    contact.href = parentBookingURL({destination:'contact',language:currentLanguage(),base:new URL('./',import.meta.url)});
    card.append(element('p', 'ride-check-intro', 'A street address is needed to check school transportation.'), contact);
    return dispose;
  }

  const address = [row.address, row.city, [row.state, row.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  card.append(element('p', 'ride-check-origin', 'From ' + address));
  const form = element('form', 'ride-check-form');
  const label = element('label', 'ride-check-label', 'School');
  const field = element('input', 'ride-check-input');
  field.type = 'text';
  field.id = id + '-school';
  label.htmlFor = field.id;
  field.maxLength = 120;
  field.required = true;
  field.autocomplete = 'off';
  field.placeholder = 'Choose or type a school';
  field.value = typeof options.initialSchool === 'string' ? options.initialSchool.slice(0, 120) : '';
  const choices = element('datalist');
  choices.id = id + '-choices';
  const nearby = schoolChoices(options.schools ?? row._schools);
  const directory = schoolChoices([...nearby, ...miamiSchools, ...(options.directorySchools || [])]);
  for (const school of directory) {
    const option = element('option');
    option.value = school;
    choices.append(option);
  }
  field.setAttribute('list', choices.id);

  const action = element('button', 'ride-check-submit', 'Check service');
  action.type = 'submit';
  const controls = element('div', 'ride-check-controls');
  controls.append(field, action);
  form.append(label, controls, choices);
  if (nearby.length) {
    const nearbyGroup = element('div', 'ride-check-nearby');
    nearbyGroup.append(element('span', 'ride-check-nearby-label', 'Nearby schools'));
    for (const name of nearby.slice(0, 3)) {
      const button = element('button', 'ride-check-suggestion', name);
      button.type = 'button';
      button.addEventListener('click', () => {
        field.value = name;
        field.dispatchEvent(new Event('input', {bubbles:true}));
        field.focus({preventScroll:true});
      }, {signal:scope.signal});
      nearbyGroup.append(button);
    }
    form.append(nearbyGroup);
  }

  const result = element('div', 'ride-check-result');
  result.setAttribute('aria-live', 'polite');
  result.setAttribute('aria-atomic', 'true');
  card.append(form, result);

  function bookingLink(school) {
    const link = element('a','ride-check-contact');
    activeBooking=link;updateBookingLabel();
    link.setAttribute('data-own-language','');
    link.href = parentBookingURL({schoolId:officialNames.get(normalizeSchool(school)),
      language:currentLanguage(),base:new URL('./',import.meta.url)});
    return link;
  }

  function clearResult() {
    activeBooking=null;version++;
    request?.abort();
    action.disabled = false;
    field.setCustomValidity('');
    result.replaceChildren();
  }
  field.addEventListener('input', clearResult, {signal: scope.signal});
  form.addEventListener('submit', event => {
    event.preventDefault();
    const school = field.value.trim().replace(/\s+/g, ' ');
    if (!school) {
      field.setCustomValidity(localText('Enter a school name.'));
      field.reportValidity();
      return;
    }
    if(!options.lookup){clearResult();result.append(bookingLink(school));return;}
    const spanish=currentLanguage()==='es';
    const versionAtPrompt=version;
    confirmParentAction({
      language:currentLanguage(),trigger:action,signal:scope.signal,
      heading:spanish?'¿Consultar esta ruta exacta?':'Check this exact route?',
      message:spanish?'La consulta envía a Buggy Maps los datos que identifican esta casa y el nombre de la escuela para comprobar el servicio.':'This check sends the selected home’s identifier and school name to Buggy Maps to look up service.',
      confirmLabel:spanish?'Soy madre, padre o tutor. Consultar':'I’m a parent or guardian. Check service',
      onConfirm(){if(versionAtPrompt===version && !scope.signal.aborted)checkService(school);}
    });
  }, {signal:scope.signal});

  async function checkService(school) {
    clearResult();
    const current = version;
    request = new AbortController();
    let record = null;
    let unavailable = false;
    action.disabled = true;
    result.append(element('p', '', 'Checking service…'));
    try {
      record = await options.lookup({propertyId:row.id, school, signal:request.signal});
    } catch {
      unavailable = true;
    }
    if (scope.signal.aborted || version !== current) return;
    action.disabled = false;
    result.replaceChildren();
    if (isCurrentRideConfirmation(record, row.id, school)) {
      result.append(element('strong', 'ride-check-state', 'Service confirmed'));
      const checked = displayDate.format(new Date(record.checkedAt + 'T00:00:00Z'));
      result.append(element('p', '', 'Buggy confirmed service from this address to ' + school + ' on ' + checked + '. Ask about available seats and pickup times.'));
    } else {
      result.append(element('strong', 'ride-check-state', unavailable ? 'Service check unavailable' : 'Check with Buggy'));
      const copy = unavailable ? 'The service lookup could not load. You can ask Buggy directly.' :
        'Service from this address to ' + school + ' hasn’t been confirmed in this app.';
      result.append(element('p', '', copy));
    }
    result.append(bookingLink(school));
  }
  return dispose;
}
