// The opening panel is only for an untouched Homes map. A deep link always
// opens its own property, search, school or route without an intermediate cover.
import { currentMapParams } from './trip-location.js';

const labels = {
  en: {
    title: 'Plan a school trip',
    lede: 'Find your home, explore nearby schools and see the drive.',
    home: 'Find my home', schools: 'Browse schools', sample: 'Try a sample trip',
    briefTitle:'Real estate agents', briefAction:'Build a school brief for a buyer',
    sampleTitle: 'Coconut Grove school drive', open: 'Open directions',
    credit: 'House photo · National Park Service, 2013', galleries: 'Browse homes with photo galleries',
    expand: 'More details', collapse: 'More map', expandName: 'Expand details', collapseName: 'Expand map',
    sheet: 'Map details', searchArea: 'Search this area', resetArea: 'Clear area'
  },
  es: {
    title: 'Planea una ruta escolar',
    lede: 'Busca tu casa, explora las escuelas cercanas y consulta el recorrido.',
    home: 'Buscar mi casa', schools: 'Ver escuelas', sample: 'Prueba una ruta',
    briefTitle:'Agentes inmobiliarios', briefAction:'Crear una ficha de escuelas para un comprador',
    sampleTitle: 'Ruta escolar en Coconut Grove', open: 'Ver indicaciones',
    credit: 'Foto de la casa · National Park Service, 2013', galleries: 'Ver casas con galerías de fotos',
    expand: 'Ver más detalles', collapse: 'Ver más mapa', expandName: 'Ampliar detalles', collapseName: 'Ampliar mapa',
    sheet: 'Detalles del mapa', searchArea: 'Buscar en esta zona', resetArea: 'Quitar zona'
  }
};

export function isJourneyStart(search) {
  const params = new URLSearchParams(search);
  if (params.has('mode') && params.get('mode') !== 'homes') return false;
  for (const key of params.keys()) {
    if (!['mode', 'layer', 'lang'].includes(key)) return false;
  }
  return true;
}

function setupJourneyLayout() {
  const start = document.getElementById('journey-start');
  if (!start) return;
  const sheet = document.getElementById('map-sheet');
  const toggle = document.getElementById('sheet-toggle');
  const search = document.getElementById('query');
  const findHome = document.getElementById('journey-find-home');
  const visibleToggle = toggle.querySelector('.journey-toggle-text');
  const mobile = window.matchMedia('(max-width:730px)');
  let previousPlace, previousLanguage;
  function language() {
    return document.documentElement.lang === 'es' ? 'es' : 'en';
  }
  function updateToggle() {
    const copy = labels[language()];
    const expanded = sheet.dataset.expanded === 'true';
    visibleToggle.textContent = expanded ? copy.collapse : copy.expand;
    toggle.setAttribute('aria-label', expanded ? copy.collapseName : copy.expandName);
    sheet.setAttribute('aria-label', copy.sheet);
  }
  function setExpanded(expanded) {
    sheet.dataset.expanded = String(expanded);
    toggle.setAttribute('aria-expanded', String(expanded));
    updateToggle();
  }
  function sync() {
    const params = currentMapParams();
    const empty = isJourneyStart(params);
    const locale = language();
    const copy = labels[locale];
    const leavingStart = !empty && !start.hidden && start.contains(document.activeElement);
    start.hidden = !empty;
    if (leavingStart) sheet.focus({preventScroll:true});
    if (locale !== previousLanguage) {
      for (const node of start.querySelectorAll('[data-journey-key]')) {
        node.textContent = copy[node.dataset.journeyKey];
      }
      document.getElementById('journey-agent-brief').href='./client-brief.html'+(locale==='es'?'?lang=es':'');
      // The map-area controller may replace the button contents with its own
      // label after a filter is selected; preserve its state and event handlers.
      const searchArea = document.getElementById('search-area');
      const resetArea = document.getElementById('reset-area');
      if (searchArea) searchArea.textContent = copy.searchArea;
      if (resetArea) resetArea.textContent = copy.resetArea;
      previousLanguage = locale;
    }
    updateToggle();
    params.delete('lang');params.delete('layer');
    const place = params.toString();
    if (place !== previousPlace) {
      sheet.scrollTop = 0;
      if (mobile.matches && (params.get('mode') === 'route' ||
          params.get('mode') === 'schools' && params.has('school'))) setExpanded(true);
      if (empty && mobile.matches) setExpanded(false);
      previousPlace = place;
    }
  }
  function syncFindHome() { findHome.disabled = search.disabled; }
  findHome.addEventListener('click', () => {
    if (search.disabled) return;
    if (mobile.matches) setExpanded(false);
    search.focus({preventScroll:true});
    if (search.getBoundingClientRect().top < 0) search.scrollIntoView({block:'center',behavior:'auto'});
  });
  new MutationObserver(syncFindHome).observe(search,{attributes:true,attributeFilter:['disabled']});
  // The atlas changes this attribute at every in-app navigation, including
  // transitions between two individual homes which share a mode.
  new MutationObserver(sync).observe(document.body,{attributes:true,attributeFilter:['data-atlas-mode']});
  new MutationObserver(updateToggle).observe(sheet,{attributes:true,attributeFilter:['data-expanded']});
  window.addEventListener('popstate',sync);
  window.addEventListener('buggy-language-change',sync);
  syncFindHome();
  sync();
}

if (typeof document !== 'undefined') setupJourneyLayout();
