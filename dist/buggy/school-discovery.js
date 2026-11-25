import { lookupBuggySchool } from './buggy-schools.js';
import { publicSharing } from './share-link.js';
import { setMapHref } from './trip-location.js';

const types = ['public', 'charter', 'private'];
const gradeBands = { elementary:[0,5], middle:[6,8], high:[9,12] };
const filterKeys = ['type', 'grade', 'mapped', 'partner'];
const labels = {
  en: {
    filters:'School filters', type:'School type', grade:'Grade level', anyType:'All types', anyGrade:'All grades',
    public:'Public', charter:'Charter', private:'Private', elementary:'Elementary (K–5)', middle:'Middle (6–8)', high:'High (9–12)',
    mapped:'Mapped campuses', partner:'Listed by Buggy', clear:'Clear filters', matched:n=>n+' matching '+(n==='1'?'school':'schools'),
    near:'Schools near this home', distance:'Distances are measured in a straight line. Check school assignment with the district and ride availability with Buggy.', route:'Directions',
    routeTo:name=>'Directions to '+name, missing:'A verified map location is needed to find nearby campuses.',
    waiting:'Campus locations are loading.', empty:'No mapped campuses match this selection.', imagery:'Campus aerials by Miami-Dade County GIS.',
    gradeLabel:'Grades', nearbyType:'Nearby school type', nearbyGrade:'Nearby grade level',
    nearbyCount:n=>n===1?'1 nearby campus shown':n+' nearby campuses shown',
    shared:'Shared schools', schoolCount:n=>n===1?'1 school':n+' schools',
    noShared:'The schools in this link could not be found.', allSchools:'See all schools'
  },
  es: {
    filters:'Filtros de escuelas', type:'Tipo de escuela', grade:'Nivel escolar', anyType:'Todos los tipos', anyGrade:'Todos los grados',
    public:'Pública', charter:'Chárter', private:'Privada', elementary:'Primaria (K–5)', middle:'Intermedia (6–8)', high:'Secundaria (9–12)',
    mapped:'Campus en el mapa', partner:'En el directorio de Buggy', clear:'Quitar filtros', matched:n=>n+(n==='1'?' escuela encontrada':' escuelas encontradas'),
    near:'Escuelas cerca de esta casa', distance:'Las distancias se miden en línea recta. Consulta con el distrito qué escuela te corresponde y con Buggy si hay transporte disponible.', route:'Indicaciones',
    routeTo:name=>'Indicaciones para llegar a '+name, missing:'Se necesita una ubicación verificada para encontrar escuelas cercanas.',
    waiting:'Cargando ubicaciones de las escuelas.', empty:'No hay campus con ubicación para esta selección.', imagery:'Imágenes aéreas del condado de Miami-Dade.',
    gradeLabel:'Grados', nearbyType:'Tipo de escuela cercana', nearbyGrade:'Nivel de las escuelas cercanas',
    nearbyCount:n=>n===1?'Se muestra 1 campus cercano':'Se muestran '+n+' campus cercanos',
    shared:'Escuelas compartidas', schoolCount:n=>n===1?'1 escuela':n+' escuelas',
    noShared:'No se encontraron las escuelas de este enlace.', allSchools:'Ver todas las escuelas'
  }
};
const copy = language => labels[language==='es'?'es':'en'];

export const districtSchoolLocator = 'https://app.guidek12.com/miami/school_search/current/';

export function schoolFiltersFrom(params) {
  const p = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const type = p.get('type'), grade = p.get('grade');
  return {
    type:types.includes(type)?type:'',
    grade:Object.hasOwn(gradeBands,grade)?grade:'',
    mapped:p.get('mapped')==='1',
    partner:p.get('partner')==='1'
  };
}

const gradeCache = new Map();
function gradeNumber(token) {
  if (token==='PK' || token==='PREK') return -1;
  if (token==='K' || token==='KG') return 0;
  if (token==='ADULT') return 13;
  return /^(?:[1-9]|1[0-2])$/.test(token) ? Number(token) : null;
}

// Keep disjoint grades disjoint. A "PK, 9-12" campus does not serve grades K-8.
function gradeMask(grades) {
  const key = String(grades ?? '').trim().toUpperCase();
  if (gradeCache.has(key)) return gradeCache.get(key);
  let mask = 0;
  for (const segment of key.split(/[,;]/)) {
    const match = segment.trim().match(/^([A-Z]+|\d{1,2})(?:\s*[-–—]\s*([A-Z]+|\d{1,2}))?$/);
    if (!match) continue;
    const first = gradeNumber(match[1]), last = gradeNumber(match[2] || match[1]);
    if (first===null || last===null) continue;
    for (let grade=Math.max(first,0); grade<=Math.min(last,12); grade++) mask |= 1<<grade;
  }
  gradeCache.set(key,mask);
  return mask;
}
const bandMasks = Object.fromEntries(Object.entries(gradeBands).map(([band,[first,last]])=>[
  band, ((1<<(last-first+1))-1)<<first
]));

function hasPoint(row) {
  return Boolean(row && Number.isFinite(row.lat) && Number.isFinite(row.lng) &&
    Math.abs(row.lat)<=90 && Math.abs(row.lng)<=180);
}
const isMappedCampus = row => row?.campusType==='campus' && hasPoint(row);

export function sharedSchools(params, getSchool) {
  return (params.get('campuses')||'').split(',').filter(Boolean).map(getSchool).filter(row=>row?.campusType==='campus');
}

export function schoolSearchResults(rows, filters={}) {
  if (!Array.isArray(rows)) return [];
  if (!filterKeys.some(key=>filters[key])) return rows;
  return rows.filter(school=>
    (!filters.type || school.type?.toLowerCase()===filters.type) &&
    (!filters.grade || Boolean(gradeMask(school.grades) & bandMasks[filters.grade])) &&
    (!filters.mapped || isMappedCampus(school)) &&
    (!filters.partner || Boolean(lookupBuggySchool(school.id)))
  );
}

const radians = Math.PI/180;
function milesBetween(a,b) {
  const rise = Math.sin((b.lat-a.lat)*radians/2);
  const run = Math.sin((b.lng-a.lng)*radians/2);
  const h = rise*rise + Math.cos(a.lat*radians)*Math.cos(b.lat*radians)*run*run;
  return 2*3958.76*Math.asin(Math.sqrt(Math.max(0,Math.min(1,h))));
}

export function nearestSchools(home, schools, limit=5) {
  if (!hasPoint(home) || !Array.isArray(schools) || !Number.isInteger(limit) || limit<1) return [];
  return schools.filter(isMappedCampus).map(school=>({ school,miles:milesBetween(home,school) }))
    .sort((a,b)=>a.miles-b.miles || a.school.name.localeCompare(b.school.name) || a.school.id.localeCompare(b.school.id))
    .slice(0,limit);
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className=className;
  if (text !== undefined) node.textContent=text;
  return node;
}

export function renderSharedSchools(parent,{schools,language,signal}) {
  const t=copy(language);
  const section=element('section','tp sd-shortlist');
  section.lang=language;
  section.dataset.ownLanguage='';
  const intro=element('div','tp-intro');
  intro.append(element('h1','tp-heading',t.shared),element('p','tp-note',schools.length?t.schoolCount(schools.length):t.noShared));
  section.append(intro);
  const directory=new URLSearchParams({mode:'schools'});
  if (language==='es') directory.set('lang','es');
  if (schools.length) {
    const list=element('ul','sd-shortlist-items');
    for (const school of schools) {
      const item=element('li');
      const link=element('a','tp-school-entry'),destination=new URLSearchParams(directory);
      destination.set('school',school.id);
      setMapHref(link,destination);
      const icon=element('span','tp-campus-icon');
      icon.setAttribute('aria-hidden','true');
      const text=element('span','tp-school-entry-copy');
      text.append(element('strong','',school.name));
      const grades=school.grades?t.gradeLabel+' '+school.grades.replace(/-/g,'–'):'';
      const details=[t[String(school.type||'').toLowerCase()],grades].filter(Boolean).join(' · ');
      const address=[school.address,school.city,[school.state,school.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
      if (details) text.append(element('small','',details));
      if (address) text.append(element('small','',address));
      link.append(icon,text);
      item.append(link);
      list.append(item);
    }
    section.append(list);
    const share=publicSharing({kind:schools.length===1?'school':'schools',language,getSchools:()=>schools,signal});
    const actions=element('div','cw-route-actions');
    actions.append(share.trigger,share.open);
    section.append(actions,share.panel);
  }
  const browse=element('a','tp-link sd-shortlist-all',t.allSchools);
  setMapHref(browse,directory);
  section.append(browse);
  parent.replaceChildren(section);
}
function mount(parent,section,marker) {
  const previous=Array.from(parent.children).find(child=>child.classList.contains(marker));
  if (previous) previous.replaceWith(section); else parent.append(section);
}

// Navigation rebuilds the school panel. Restore keyboard focus to the control
// that initiated that exact filter change, including when the panel is new.
let pendingFocus;
const filterSignature=params=>JSON.stringify(schoolFiltersFrom(params));

export function renderSchoolFilters(parent,{params,language='en',onChange,rows}={}) {
  if (!parent) return null;
  const t=copy(language), p=new URLSearchParams(params), filters=schoolFiltersFrom(p);
  const selected=filterKeys.filter(key=>filters[key]);
  const previous=Array.from(parent.children).find(child=>child.classList.contains('sd-filters'));
  const section=element('details','sd-filters'), summary=element('summary','sd-filter-summary');
  section.dataset.ownLanguage='';
  section.open=previous ? previous.open : Boolean(selected.length);
  summary.dataset.filterKey='summary';
  summary.append(element('span','sd-filter-icon'),element('span','',t.filters));
  summary.firstElementChild.setAttribute('aria-hidden','true');
  if (selected.length) summary.append(element('span','sd-filter-count',String(selected.length)));
  const body=element('div','sd-filter-body');
  function change(key,value) {
    const next=new URLSearchParams(p);
    if (value) next.set(key,value); else next.delete(key);
    pendingFocus={key,signature:filterSignature(next),time:Date.now()};
    onChange?.(next);
  }
  const selects=element('div','sd-selects');
  for (const [key,values,empty] of [['type',types,t.anyType],['grade',Object.keys(gradeBands),t.anyGrade]]) {
    const label=element('label','sd-filter-field'), select=element('select','');
    label.append(element('span','',t[key]),select);
    const all=element('option','',empty);all.value='';select.append(all);
    for (const value of values) {
      const option=element('option','',t[value]);option.value=value;select.append(option);
    }
    select.value=filters[key];
    select.dataset.filterKey=key;
    select.addEventListener('change',()=>change(key,select.value));
    selects.append(label);
  }
  const toggles=element('div','sd-filter-toggles');
  for (const key of ['mapped','partner']) {
    const label=element('label','sd-filter-toggle');
    const box=element('input','');box.type='checkbox';box.checked=filters[key];box.dataset.filterKey=key;
    box.addEventListener('change',()=>change(key,box.checked?'1':''));
    label.append(box,element('span','',t[key]));toggles.append(label);
  }
  body.append(selects,toggles);
  if (selected.length) {
    const footer=element('div','sd-filter-footer');
    if (Array.isArray(rows)) {
      const count=schoolSearchResults(rows,filters).length.toLocaleString(language==='es'?'es-US':'en-US');
      const status=element('span','',t.matched(count));status.setAttribute('role','status');footer.append(status);
    }
    const clear=element('button','sd-clear-filters',t.clear);clear.type='button';
    clear.addEventListener('click',()=>{
      const next=new URLSearchParams(p);
      for (const key of filterKeys) next.delete(key);
      pendingFocus={key:'summary',signature:filterSignature(next),time:Date.now()};
      onChange?.(next);
    });
    footer.append(clear);body.append(footer);
  }
  section.append(summary,body);
  const active=previous?.contains(document.activeElement)?document.activeElement.dataset.filterKey:null;
  mount(parent,section,'sd-filters');
  const target=pendingFocus;
  pendingFocus=null;
  const freeToFocus=!document.activeElement || document.activeElement===document.body || document.activeElement===document.documentElement;
  const key=freeToFocus && target?.signature===filterSignature(p) && Date.now()-target.time<3000 ? target.key : active;
  if (key) section.querySelector('[data-filter-key="'+key+'"]')?.focus({preventScroll:true});
  return section;
}

function campusLink(home,school,mode,language,action,text,className) {
  const q=new URLSearchParams({mode,home:home.id,school:school.id});
  if (language==='es') q.set('lang','es');
  if (new URLSearchParams(globalThis.location?.search || '').get('layer')==='aerial') q.set('layer','aerial');
  const link=element('a',className,text);setMapHref(link,q);
  if (action) link.addEventListener('click',event=>{
    if (event.defaultPrevented || event.button>0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();event.stopPropagation();action(school);
  });
  return link;
}

const nearbyPreferences=new WeakMap();

export function renderNearbySchools(parent,{home,schools,language='en',onSchool,onRoute}={}) {
  if (!parent) return null;
  const t=copy(language), section=element('section','sd-nearby');
  section.setAttribute('aria-label',t.near);section.dataset.ownLanguage='';
  section.append(element('h2','sd-heading',t.near));
  if (!hasPoint(home) || !Array.isArray(schools) || !schools.length) {
    const reason=!hasPoint(home)?t.missing:!Array.isArray(schools)?t.waiting:t.empty;
    section.append(element('p','sd-subtext',reason));
    mount(parent,section,'sd-nearby');
    return section;
  }
  const distance=element('p','sd-subtext',t.distance);
  const district=element('a','sd-district-link',language==='es'?'Buscador del distrito':'District school locator');
  district.href=districtSchoolLocator;district.target='_blank';district.rel='noopener noreferrer';
  distance.append(document.createTextNode(' '),district);section.append(distance);
  const previous=nearbyPreferences.get(parent);
  const filters=previous?.id===home.id?previous.filters:{type:'',grade:''};
  nearbyPreferences.set(parent,{id:home.id,filters});
  const picks=element('div','sd-near-filters');
  for (const [key,values,empty,label] of [
    ['type',types,t.anyType,t.nearbyType],['grade',Object.keys(gradeBands),t.anyGrade,t.nearbyGrade]
  ]) {
    const select=element('select','');
    select.setAttribute('aria-label',label);
    for (const value of ['',...values]) {
      const option=element('option','',value?t[value]:empty);option.value=value;select.append(option);
    }
    select.value=filters[key];
    select.addEventListener('change',()=>{filters[key]=select.value;draw(true);});
    picks.append(select);
  }
  section.append(picks);
  const results=element('div','sd-near-results');
  const status=element('span','sr-only');status.setAttribute('role','status');
  section.append(results,status);
  function draw(announce=false) {
    const closest=nearestSchools(home,schoolSearchResults(schools,filters));
    if (announce) status.textContent=t.nearbyCount(closest.length);
    if (!closest.length) {results.replaceChildren(element('p','sd-subtext',t.empty));return;}
    const list=element('ul','sd-near-list');
    const format=new Intl.NumberFormat(language==='es'?'es-US':'en-US',{maximumFractionDigits:1,minimumFractionDigits:1});
    let hasAerial=false;
    for (const {school,miles} of closest) {
      const item=element('li','sd-near-row');
      const profile=campusLink(home,school,'schools',language,onSchool,undefined,'sd-near-school');
      const badge=element('span','sd-campus-thumb');badge.setAttribute('aria-hidden','true');
      const thumbnail=school.imageFallback || '';
      if (/^\.\/media\/schools\/preview\/[a-z0-9-]+\.webp$/.test(thumbnail)) {
        const img=element('img','');img.alt='';img.width=44;img.height=44;img.loading='lazy';img.decoding='async';
        img.src=thumbnail;img.addEventListener('error',()=>img.remove(),{once:true});badge.append(img);hasAerial=true;
      }
      const identity=element('span','sd-campus-copy');
      identity.append(element('strong','',school.name));
      const gradeRange=school.grades ? t.gradeLabel+' '+school.grades.replace(/-/g,'–') : '';
      const distance=miles>0 && miles<.1 ? '< '+format.format(.1)+' mi' : format.format(miles)+' mi';
      identity.append(element('small','',[distance,t[school.type?.toLowerCase()],gradeRange].filter(Boolean).join(' · ')));
      profile.append(badge,identity);
      const route=campusLink(home,school,'route',language,onRoute,t.route,'sd-near-route');
      route.setAttribute('aria-label',t.routeTo(school.name));
      item.append(profile,route);list.append(item);
    }
    results.replaceChildren(list);
    if (hasAerial) results.append(element('small','sd-photo-credit',t.imagery));
  }
  draw();
  mount(parent,section,'sd-nearby');
  return section;
}
