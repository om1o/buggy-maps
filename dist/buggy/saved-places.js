// One browser storage key per saved item keeps unrelated edits in different tabs independent.
import { setMapHref } from './trip-location.js';

const prefix = 'buggy.map.saved.v1:';
const supported = ['home', 'school', 'route'];
const words = {
  en: {
    saved:'Saved', title:'Saved places', close:'Close', all:'All', home:'Home', school:'School', route:'Trip',
    homes:'Homes', schools:'Schools', routes:'Trips', empty:'Your saved places will appear here.',
    how:'Use the bookmark on a home, school, or trip to find it here later.', noGroup:'Nothing saved here yet.',
    device:'Only on this browser and device.', temporary:'Browser storage is unavailable. Changes last for this tab only.',
    remove:'Remove', clear:'Clear all', confirm:'Remove all saved places and trips?', cancel:'Keep saved places', yes:'Remove all',
    missing:'This record is no longer in the directory.', outbound:'Home to school', back:'School to home',
    cleared:'Saved places cleared.', added:'Saved', removed:'Removed', save:'Save'
  },
  es: {
    saved:'Guardados', title:'Lugares guardados', close:'Cerrar', all:'Todo', home:'Casa', school:'Escuela', route:'Ruta',
    homes:'Casas', schools:'Escuelas', routes:'Rutas', empty:'Aquí aparecerán tus lugares guardados.',
    how:'Usa el marcador de una casa, escuela o ruta para encontrarla aquí después.', noGroup:'Todavía no guardaste nada aquí.',
    device:'Solo en este navegador y dispositivo.', temporary:'El almacenamiento del navegador no está disponible. Los cambios duran mientras esta pestaña esté abierta.',
    remove:'Quitar', clear:'Borrar todo', confirm:'¿Quitar todos los lugares y rutas guardados?', cancel:'Conservar mis lugares', yes:'Quitar todo',
    missing:'Este registro ya no aparece en el directorio.', outbound:'De casa a la escuela', back:'De la escuela a casa',
    cleared:'Se borraron los lugares guardados.', added:'Guardado', removed:'Quitado', save:'Guardar'
  }
};
const languageOf = value => String(value || '').toLowerCase().startsWith('es') ? 'es' : 'en';
const labels = value => words[languageOf(value)];

function shortPlace(value, titleKey) {
  if (!value || value.withheld) return null;
  const id = value.id;
  const title = value[titleKey] || value.title;
  if (typeof id !== 'string' || !/^[a-z0-9_-]{1,96}$/i.test(id) || typeof title !== 'string') return null;
  const clean = title.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0,140);
  return clean ? {id, title:clean} : null;
}

// Select only public record identifiers and display names, even if a caller supplies an entire record.
export function savedRecord(data) {
  if (!data || !supported.includes(data.kind)) return null;
  const home = shortPlace(data.home, 'address'), school = shortPlace(data.school, 'name');
  if (data.kind === 'home') return home ? {kind:'home',home} : null;
  if (data.kind === 'school') return school ? {kind:'school',school} : null;
  return home && school ? {kind:'route',home,school,direction:data.direction === 'return' ? 'return' : 'outbound'} : null;
}

function itemKey(item) {
  return [item.kind, item.home?.id, item.school?.id, item.direction].filter(Boolean).join(':');
}

export function savedParams(item, language, fullCountyRecord=false) {
  const p = new URLSearchParams();
  if (item.kind === 'home') p.set(fullCountyRecord && /^county-\d{13}$/.test(item.home.id) ? 'property' : 'map',item.home.id);
  if (item.kind === 'school') {p.set('mode','schools');p.set('school',item.school.id);}
  if (item.kind === 'route') {
    p.set('mode','route');p.set('home',item.home.id);p.set('school',item.school.id);
    if (item.direction === 'return') p.set('dir','return');
  }
  if (languageOf(language) === 'es') p.set('lang','es');
  return p;
}

export function createSavedStore(getStorage) {
  let storage, entries = new Map();
  try { storage = getStorage(); } catch { storage = null; }

  function keys() {
    const saved = [];
    for (let i=0; i<storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(prefix)) saved.push(key);
    }
    return saved;
  }
  function sync() {
    if (!storage) return;
    try {
      const fresh = new Map();
      for (const key of keys()) {
        const raw = storage.getItem(key);
        try {
          const item = savedRecord(JSON.parse(raw));
          if (item && key === prefix+itemKey(item)) fresh.set(itemKey(item),item);
        } catch { /* An older or interrupted entry can be cleared from the list. */ }
      }
      entries = fresh;
    } catch { storage = null; }
  }
  function change(write) {
    if (storage) { try { write(); } catch { storage = null; } }
  }
  sync();
  return {
    sync,
    list:() => Array.from(entries.values()), has:key => entries.has(key),
    get persistent() { return Boolean(storage); },
    put(data) {
      const item = savedRecord(data);
      if (!item) return false;
      const key = itemKey(item);
      change(() => storage.setItem(prefix+key,JSON.stringify(item)));entries.set(key,item);return true;
    },
    remove(key) {
      change(() => storage.removeItem(prefix+key));entries.delete(key);
    },
    clear() {
      change(() => {for (const key of keys()) storage.removeItem(key);});entries.clear();
    }
  };
}

let activeStore;
const store = () => activeStore || (activeStore = createSavedStore(() => window.localStorage));
const toggleDetails = new WeakMap(), installed = new WeakMap();
const svgNS = 'http://www.w3.org/2000/svg';
function bookmark() {
  const image = document.createElementNS(svgNS,'svg'), shape = document.createElementNS(svgNS,'path');
  image.setAttribute('viewBox','0 0 24 24');image.setAttribute('aria-hidden','true');
  shape.setAttribute('d','M6 5.25A1.75 1.75 0 0 1 7.75 3.5h8.5A1.75 1.75 0 0 1 18 5.25V21l-6-3.8L6 21z');
  image.append(shape);return image;
}
function node(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
}
function button(cls,text,handler) {
  const el = node('button',cls,text);el.type='button';el.addEventListener('click',handler);return el;
}
function title(item) {
  if (item.kind !== 'route') return item[item.kind].title;
  return (item.direction === 'return' ? [item.school.title,item.home.title] : [item.home.title,item.school.title]).join(' → ');
}
function updateToggle(el, language) {
  const detail = toggleDetails.get(el);
  if (!detail) return;
  const {item,text} = detail, word = labels(language || detail.language);
  const active = store().has(itemKey(item));
  text.textContent = active ? word.saved : word.save;
  el.setAttribute('aria-pressed', String(active));
  el.setAttribute('aria-label', (active ? word.remove : word.save)+' · '+title(item));
}
function announce(message) {
  window.dispatchEvent(new CustomEvent('buggy-saved-change',{detail:{message}}));
}

export function savedButton(data, language='en') {
  const item=savedRecord(data), el=node('button','sp-toggle');
  el.type='button';el.setAttribute('data-own-language','');
  if (!item) {el.hidden=true;el.disabled=true;return el;}
  el.setAttribute('data-buggy-save','');
  const text=node('span');el.append(bookmark(),text);
  toggleDetails.set(el,{item,text,language});
  updateToggle(el,language);
  el.addEventListener('click',()=>{
    const db=store(), key=itemKey(item);
    db.sync();const existed=db.has(key);
    if (existed) db.remove(key); else db.put(item);
    const lang=document.documentElement.lang || language, word=labels(lang);
    updateToggle(el,lang);
    announce((existed ? word.removed : word.added)+' · '+title(item)+(!db.persistent ? '. '+word.temporary : ''));
  });
  return el;
}

const overlayFlag = 'buggySavedPlaces';
export function installSavedPlaces({button:opener,dialog,onNavigate,getLanguage,isAvailable}={}) {
  if (!opener || !dialog) return;
  if (installed.has(dialog)) return installed.get(dialog);
  const db=store(), lang=()=>languageOf(getLanguage?.() || document.documentElement.lang);
  const controller=new AbortController(), listen=(el,type,fn)=>el.addEventListener(type,fn,{signal:controller.signal});
  const feedback=node('span','sr-only');feedback.setAttribute('role','status');feedback.setAttribute('data-own-language','');opener.after(feedback);
  dialog.classList.add('sp-dialog');dialog.setAttribute('data-own-language','');dialog.setAttribute('aria-labelledby','sp-title');
  opener.classList.add('sp-launch');opener.setAttribute('aria-haspopup','dialog');if (dialog.id) opener.setAttribute('aria-controls',dialog.id);
  const launchText=node('span','sp-launch-text'), launchCount=node('span','sp-count');
  launchCount.setAttribute('aria-hidden','true');opener.replaceChildren(bookmark(),launchText,launchCount);
  let group='all', confirming=false, priorFocus, afterClose, closingForBack=false;
  function closeUI() {
    if (!dialog.open && !dialog.hasAttribute('open')) return;
    if (typeof dialog.close==='function') dialog.close(); else dialog.removeAttribute('open');
    opener.setAttribute('aria-expanded','false');
    if (priorFocus?.isConnected) priorFocus.focus({preventScroll:true});
  }
  function openUI() {
    if (dialog.open || dialog.hasAttribute('open')) return;
    priorFocus=document.activeElement && document.activeElement!==document.body ? document.activeElement : opener;confirming=false;group='all';db.sync();
    if (typeof dialog.showModal==='function') dialog.showModal();else dialog.setAttribute('open','');
    opener.setAttribute('aria-expanded','true');render();dialog.querySelector('.sp-close')?.focus({preventScroll:true});
  }
  function dismiss(next) {
    closeUI();
    if (history.state?.[overlayFlag]) {
      afterClose=next;closingForBack=true;history.back();
    } else next?.();
  }
  function pop() {
    if (history.state?.[overlayFlag]) {openUI();return;}
    closeUI();const callback=afterClose;afterClose=null;closingForBack=false;callback?.();
  }

  function render() {
    const word=labels(lang()), items=db.list();
    launchText.textContent=word.saved;launchCount.hidden=!items.length;launchCount.textContent=String(items.length);
    opener.setAttribute('aria-label',word.title+(items.length?' ('+items.length+')':''));
    for (const toggle of document.querySelectorAll('[data-buggy-save]')) updateToggle(toggle,lang());
    if (!dialog.hasAttribute('open')) return;
    const focused=dialog.contains(document.activeElement) ? document.activeElement?.getAttribute('data-sp-focus') : null;
    const sheet=node('section','sp-sheet');sheet.lang=lang();
    const top=node('header','sp-head'), h=node('h2','sp-title',word.title);h.id='sp-title';
    const exit=button('sp-close', '×',()=>dismiss());exit.setAttribute('aria-label',word.close);exit.dataset.spFocus='close';
    top.append(h,exit);sheet.append(top);
    sheet.append(node('p','sp-note',db.persistent ? word.device : word.temporary));
    if (items.length) {
      const filters=node('div','sp-filters');filters.setAttribute('role','group');filters.setAttribute('aria-label',word.title);
      for (const kind of ['all',...supported]) {
        const count=kind==='all' ? items.length : items.filter(i=>i.kind===kind).length;
        const label=kind==='all'?word.all:word[kind+'s'];
        const pill=button('sp-filter',label+' '+count,()=>{group=kind;confirming=false;render();});
        pill.setAttribute('aria-pressed',String(kind===group));pill.dataset.spFocus='filter-'+kind;filters.append(pill);
      }
      sheet.append(filters);
    } else {group='all';confirming=false;}
    const visible=items.filter(i=>group==='all' || group===i.kind).sort((a,b)=>title(a).localeCompare(title(b),lang(),{numeric:true}));
    if (!visible.length) {
      const empty=node('div','sp-empty');empty.append(bookmark(),node('p','sp-empty-title',items.length ? word.noGroup : word.empty));
      if (!items.length) empty.append(node('p','sp-note',word.how));sheet.append(empty);
    } else {
      const list=node('ul','sp-list');
      for (const item of visible) {
        const row=node('li','sp-item'), key=itemKey(item);
        const missingHome=item.home && isAvailable?.('home',item.home.id)===false;
        const fullCountyRecord=missingHome && item.kind==='home' && /^county-\d{13}$/.test(item.home.id);
        const missing=Boolean(missingHome && !fullCountyRecord || item.school && isAvailable?.('school',item.school.id)===false);
        const open=node(missing?'div':'a','sp-place');
        if (!missing) {
          const p=savedParams(item,lang(),fullCountyRecord);setMapHref(open,p);open.dataset.spFocus='open-'+key;
          open.addEventListener('click',event=>{
            if (event.button || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
            if (onNavigate) {event.preventDefault();dismiss(()=>onNavigate(p));}
          });
        }
        const type=item.kind==='route' ? (item.direction==='return' ? word.back : word.outbound) : word[item.kind];
        open.append(node('span','sp-kind',type),node('strong','sp-name',title(item)));
        if (missing) open.append(node('small','sp-note',word.missing));
        const remove=button('sp-remove',word.remove,()=>{db.remove(key);announce(word.removed+' · '+title(item));});
        remove.dataset.spFocus='remove-'+key;remove.setAttribute('aria-label',word.remove+' · '+title(item));row.append(open,remove);list.append(row);
      }
      sheet.append(list);
    }
    if (items.length) {
      const foot=node('div','sp-foot');
      if (confirming) {
        const prompt=node('p','sp-confirm',word.confirm);prompt.setAttribute('role','alert');
        const keep=button('sp-secondary',word.cancel,()=>{confirming=false;render();dialog.querySelector('.sp-clear')?.focus();});
        const clear=button('sp-destructive',word.yes,()=>{db.clear();confirming=false;announce(word.cleared);});
        keep.dataset.spFocus='keep';clear.dataset.spFocus='clear-confirm';foot.append(prompt,keep,clear);
      } else {
        const clear=button('sp-clear',word.clear,()=>{confirming=true;render();dialog.querySelector('.sp-secondary')?.focus();});
        clear.dataset.spFocus='clear';foot.append(clear);
      }
      sheet.append(foot);
    }
    dialog.replaceChildren(sheet);
    if (focused) {
      const next=Array.from(dialog.querySelectorAll('[data-sp-focus]')).find(n=>n.dataset.spFocus===focused);
      (next || dialog.querySelector('.sp-place[href]') || exit).focus({preventScroll:true});
    }
  }
  listen(opener,'click',()=>{
    if (closingForBack) return;
    if (!history.state?.[overlayFlag]) {
      try {history.pushState({...history.state,[overlayFlag]:true},'',window.location.href);} catch { /* Native dialog still works without history. */ }
    }
    openUI();
  });
  listen(dialog,'cancel',event=>{event.preventDefault();dismiss();});
  listen(dialog,'click',event=>{if (event.target===dialog) dismiss();});
  listen(window,'popstate',pop);
  listen(window,'storage',event=>{
    if (event.key===null || typeof event.key==='string' && event.key.startsWith(prefix)) {db.sync();render();}
  });
  listen(window,'buggy-saved-change',event=>{feedback.textContent=event.detail?.message || '';render();});
  listen(window,'buggy-language-change',render);
  opener.setAttribute('aria-expanded','false');render();
  if (history.state?.[overlayFlag]) openUI();
  const api={dispose(){controller.abort();feedback.remove();closeUI();installed.delete(dialog);}};
  installed.set(dialog,api);return api;
}
