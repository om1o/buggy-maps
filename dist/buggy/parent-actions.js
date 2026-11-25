import {lookupBuggySchool, verifiedBuggySchoolIds} from './buggy-schools.js';

const publicMapBase = 'https://miami-homes-march-2026.aoraboracora.chatgpt.site/buggy/';
const localMapBase = new URL('./', import.meta.url);
const official = {
  finder: 'https://buggy.biz/schools',
  website: 'https://buggyto.school/',
  contact: 'https://buggyto.school/contact'
};
const officialCampusIds = new Map([...verifiedBuggySchoolIds].map(id => [lookupBuggySchool(id).url, id]));

export function parentBookingURL({schoolId, language='en', destination='finder', base=publicMapBase} = {}) {
  const url = new URL('booking/', base);
  if (destination === 'finder' && lookupBuggySchool(schoolId)) url.searchParams.set('school', schoolId);
  else if (destination === 'website' || destination === 'contact') url.searchParams.set('to', destination);
  if (language === 'es') url.searchParams.set('lang', 'es');
  return url.href;
}

export function bookingDetails(search, language) {
  const params = new URLSearchParams(search);
  const school = lookupBuggySchool(params.get('school'));
  const to = params.get('to');
  const destination = to === 'website' || to === 'contact' ? to : 'finder';
  const campus = destination === 'finder' ? school : null;
  const url = campus?.url || official[destination];
  const domain = new URL(url).hostname;
  const es = language === 'es';
  const message = es
    ? (campus ? 'Abrirás la página de ' + campus.name + ' en ' + domain + '.' : 'Abrirás el sitio oficial de Buggy en ' + domain + '.') + ' Allí tú eliges qué datos dar para consultar una plaza. La dirección de casa se queda en el mapa.'
    : (campus ? 'You will open the page for ' + campus.name + ' on ' + domain + '.' : 'You will open Buggy’s official site at ' + domain + '.') + ' You choose what to enter there when asking about a ride. Your home address stays on this map.';
  return {
    url, domain, message, schoolId:campus ? params.get('school') : '', destination,
    heading:es ? '¿Quieres abrir el sitio de Buggy?' : 'Open Buggy’s booking site?',
    confirmLabel:es ? 'Soy madre, padre o tutor. Continuar' : 'I’m a parent or guardian. Continue'
  };
}

export function confirmParentAction({language='en', heading, message, confirmLabel, onConfirm, trigger, signal}) {
  if (signal?.aborted || typeof onConfirm !== 'function') return;
  const d = document;
  const previous = trigger || d.activeElement;
  if (d.querySelector('.buggy-parent-dialog')) return;
  const dialog = d.createElement('dialog');
  dialog.className = 'buggy-parent-dialog';
  dialog.lang = language === 'es' ? 'es' : 'en';
  dialog.setAttribute('data-own-language', '');
  dialog.setAttribute('aria-labelledby', 'buggy-parent-heading');
  dialog.setAttribute('aria-describedby', 'buggy-parent-message');
  dialog.setAttribute('aria-modal', 'true');
  const label = d.createElement('p');
  label.className = 'buggy-parent-label';
  label.textContent = language === 'es' ? 'Para madres, padres y tutores' : 'For parents and guardians';
  const h = d.createElement('h2');
  h.id = 'buggy-parent-heading';
  h.textContent = heading;
  const text = d.createElement('p');
  text.id = 'buggy-parent-message';
  text.textContent = message;
  const cancel = d.createElement('button');
  cancel.type = 'button';
  cancel.autofocus = true;
  cancel.textContent = language === 'es' ? 'Cancelar' : 'Cancel';
  const confirm = d.createElement('button');
  confirm.className = 'buggy-parent-confirm';
  confirm.type = 'button';
  confirm.textContent = confirmLabel;
  const actions = d.createElement('div');
  actions.className = 'buggy-parent-buttons';
  actions.append(cancel, confirm);
  dialog.append(label, h, text, actions);
  let overlay = null;
  const shielded = [];
  let observedTrigger = null;
  const dismissOnLanguage = () => {
    if (d.documentElement.lang !== dialog.lang) dismiss();
  };
  function dismiss() {
    if (!dialog.isConnected) return;
    observedTrigger?.disconnect();
    window.removeEventListener('popstate', dismiss);
    window.removeEventListener('pagehide', dismiss);
    window.removeEventListener('buggy-language-change', dismissOnLanguage);
    signal?.removeEventListener('abort', dismiss);
    if (dialog.open && typeof dialog.close === 'function') dialog.close();
    dialog.remove();
    overlay?.remove();
    for (const el of shielded) el.inert = false;
    if (previous?.isConnected) previous.focus({preventScroll:true});
  }
  cancel.addEventListener('click', dismiss);
  dialog.addEventListener('cancel', event => { event.preventDefault(); dismiss(); });
  dialog.addEventListener('click', event => { if (event.target === dialog) {
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dismiss();
  }});
  confirm.addEventListener('click', () => {
    if (signal?.aborted || !dialog.isConnected) return;
    dismiss();
    onConfirm();
  });
  signal?.addEventListener('abort', dismiss, {once:true});
  window.addEventListener('popstate', dismiss);
  window.addEventListener('pagehide', dismiss);
  window.addEventListener('buggy-language-change', dismissOnLanguage);
  d.body.append(dialog);
  if (previous?.isConnected && typeof MutationObserver === 'function') {
    observedTrigger = new MutationObserver(() => { if (!previous.isConnected) dismiss(); });
    observedTrigger.observe(d.body, {childList:true, subtree:true});
  }
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else {
    overlay = d.createElement('div');
    overlay.className = 'buggy-parent-backdrop';
    d.body.append(overlay);overlay.append(dialog);
    dialog.setAttribute('open','');
    dialog.setAttribute('role','dialog');
    for (const el of d.body.children) if (el !== overlay && !el.inert) {el.inert=true;shielded.push(el);}
    overlay.addEventListener('click',event=>{if(event.target===overlay)dismiss();});
    dialog.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();dismiss();}
      else if(event.key==='Tab' && ((event.shiftKey && d.activeElement===cancel) || (!event.shiftKey && d.activeElement===confirm))){
        event.preventDefault();(event.shiftKey?confirm:cancel).focus();
      }
    });
  }
  cancel.focus({preventScroll:true});
}

// Map only known official destinations to first-party links. Never carry arbitrary query strings.
function asBookingURL(href, language, base) {
  let url;
  try { url = new URL(href, base); } catch { return null; }
  if (url.username || url.password) return null;
  const handoff = new URL('booking/', base);
  if (url.origin === handoff.origin && [handoff.pathname,handoff.pathname+'index.html'].includes(url.pathname)) {
    const details = bookingDetails(url.search, language);
    return parentBookingURL({...details,language,base});
  }
  if (url.protocol !== 'https:') return null;
  const clean = url.origin + (url.pathname.replace(/\/+$/, '') || '/');
  const schoolId = officialCampusIds.get(clean);
  if (schoolId) return parentBookingURL({schoolId,language,base});
  if (url.hostname === 'buggy.biz' || url.hostname === 'www.buggy.biz') return parentBookingURL({language,base});
  if (['buggyto.school','www.buggyto.school','bu99y.com','www.bu99y.com'].includes(url.hostname)) {
    return parentBookingURL({language,destination:url.pathname.replace(/\/+$/, '') === '/contact'?'contact':'website',base});
  }
  return null;
}

const installedDocuments = new WeakSet();

export function installParentBooking(d, base=localMapBase) {
  if (!d?.body || d.body.hasAttribute('data-booking-handoff') || installedDocuments.has(d)) return;
  installedDocuments.add(d);
  const language = () => d.documentElement.lang === 'es' ? 'es' : 'en';
  const officialTargets = new WeakSet();
  function protect(a) {
    if (officialTargets.has(a)) return null;
    const href = a.getAttribute('href');
    if (!href) return null;
    let absolute;
    try { absolute = new URL(href, d.baseURI); } catch { return null; }
    const safe = asBookingURL(absolute.href, language(), base);
    if (!safe) return null;
    if (absolute.href !== safe) a.href = safe;
    a.setAttribute('referrerpolicy', 'no-referrer');
    a.rel = 'noopener noreferrer';
    return safe;
  }
  function protectTree(el) {
    if (el.nodeType !== 1 || el.closest('svg')) return;
    if (el.tagName === 'A') protect(el);
    else for (const a of el.querySelectorAll('a[href]')) protect(a);
  }
  protectTree(d.body);
  const watcher = new MutationObserver(changes => {
    for (const c of changes) {
      if (c.type === 'attributes') {
        if (c.target === d.documentElement && c.attributeName === 'lang') protectTree(d.body);
        else if (c.target.tagName === 'A') protect(c.target);
      } else for (const node of c.addedNodes) protectTree(node);
    }
  });
  watcher.observe(d.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['href','lang']});
  d.addEventListener('click', event => {
    const a = event.target?.closest?.('a[href]');
    if (!a || officialTargets.has(a) || event.defaultPrevented) return;
    const safe = protect(a);
    if (!safe || event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const details = bookingDetails(new URL(safe).search, language());
    confirmParentAction({...details, language:language(), trigger:a, onConfirm() {
      const next = d.createElement('a');
      next.href = details.url;
      next.rel = 'noopener noreferrer';
      next.referrerPolicy = 'no-referrer';
      if (a.target === '_blank') next.target = '_blank';
      officialTargets.add(next);
      next.click();
    }});
  },true);
}

if (typeof document !== 'undefined' && typeof MutationObserver !== 'undefined') {
  if (document.body) installParentBooking(document);
  else document.addEventListener('DOMContentLoaded', () => installParentBooking(document), {once:true});
}
