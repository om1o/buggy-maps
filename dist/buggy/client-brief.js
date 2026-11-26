import {currentLanguage, setLanguage, setupLanguage} from './language.js';
import {createSchoolDirectory} from './school-mode.js';
import {districtSchoolLocator} from './school-discovery.js';
import {buildSchoolBrief, searchBriefSchools} from './school-brief.js';
import {writePublicLink} from './share-link.js';

const copy = {
  en: {
    skip:'Skip to brief builder', back:'Back to map', title:'School brief',
    intro:'Choose up to three Miami-Dade schools to share with a client.',
    searchHeading:'Choose schools', searchLabel:'Search the school directory', retry:'Try again',
    sheetHeading:'Selected schools', empty:'The schools you choose will appear here.',
    example:'Try the Coconut Grove example', scope:'Use the district locator to check school assignment. Confirm enrollment with the school and ride availability with Buggy.',
    locator:'District school locator', openMap:'Open school map', copy:'Copy map link', copyFallback:'School map link',
    print:'Print brief', tools:'AI agent tools', loading:'Loading the school directory…', failed:'The school directory could not load.',
    hint:'Search by school name, city, or ZIP code.', noResults:'No matching campuses. Try another name or ZIP code.',
    matches:n=>n===1?'1 result shown.':n+' results shown.', count:n=>n+' of 3',
    full:'Your brief has three schools. Remove one to add another.', add:'Add', added:'Added', remove:'Remove',
    grades:'Grades', types:{Public:'Public',Charter:'Charter',Private:'Private'}, schoolSite:'School website', source:'Directory source',
    dated:date=>'School directory snapshot · '+date, copied:'School map link copied.', manual:'Select and copy the school map link.', sent:n=>n+' added to the brief.', removed:n=>n+' removed.'
  },
  es: {
    skip:'Ir al editor de la ficha', back:'Volver al mapa', title:'Ficha de escuelas',
    intro:'Elige hasta tres escuelas de Miami-Dade para compartirlas con un cliente.',
    searchHeading:'Elegir escuelas', searchLabel:'Buscar en el directorio escolar', retry:'Volver a intentar',
    sheetHeading:'Escuelas seleccionadas', empty:'Aquí aparecerán las escuelas que elijas.',
    example:'Probar el ejemplo de Coconut Grove', scope:'Consulta la escuela asignada en el localizador del distrito. Confirma la matrícula con la escuela y la disponibilidad de transporte con Buggy.',
    locator:'Localizador de escuelas del distrito', openMap:'Abrir el mapa escolar', copy:'Copiar enlace al mapa', copyFallback:'Enlace al mapa escolar',
    print:'Imprimir ficha', tools:'Herramientas para agentes de IA', loading:'Cargando el directorio escolar…', failed:'No se pudo cargar el directorio escolar.',
    hint:'Busca por escuela, ciudad o código postal.', noResults:'Sin coincidencias. Prueba con otro nombre o código postal.',
    matches:n=>n===1?'1 resultado visible.':n+' resultados visibles.', count:n=>n+' de 3',
    full:'Ya elegiste tres escuelas. Quita una para añadir otra.', add:'Añadir', added:'Añadida', remove:'Quitar',
    grades:'Grados', types:{Public:'Pública',Charter:'Chárter',Private:'Privada'}, schoolSite:'Sitio de la escuela', source:'Fuente del directorio',
    dated:date=>'Fecha del directorio escolar · '+date, copied:'Se copió el enlace al mapa escolar.', manual:'Selecciona y copia el enlace al mapa escolar.', sent:n=>'Se añadió '+n+'.', removed:n=>'Se quitó '+n+'.'
  }
};

const field = name => document.getElementById('brief-'+name);
const el = (tag, text, className) => {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const directory = createSchoolDirectory();
const ids = [];
let loadFailed = false;
let language = setupLanguage();
let words = copy[language];
let brief;
let revision = 0;

function externalLink(label, url) {
  const link = el('a',label,'brief-school-link');
  link.href=url; link.target='_blank'; link.rel='noopener noreferrer';
  return link;
}
function describe(row) {
  return [words.types[row.type] || row.type, row.grades && words.grades+' '+row.grades].filter(Boolean).join(' · ');
}
function action(label, name, className, fn) {
  const button=el('button',label,className);
  button.type='button'; button.setAttribute('aria-label',label+' '+name);
  button.addEventListener('click',fn);
  return button;
}

function renderResults() {
  const term=field('search').value.trim();
  const rows=directory.ready ? searchBriefSchools(directory,term) : [];
  const status=field('status');
  const list=field('results');
  list.replaceChildren();
  if (!directory.ready) {status.textContent=loadFailed?words.failed:words.loading; return;}
  status.textContent=ids.length===3 ? words.full : !term ? words.hint : rows.length ? words.matches(rows.length) : words.noResults;
  for (const row of rows) {
    const selected=ids.includes(row.id);
    const li=el('li'), details=el('div');
    details.append(el('strong',row.name),el('p',[describe(row),row.address,row.city,row.zip].filter(Boolean).join(' · '),'brief-facts'));
    const add=action(selected?words.added:words.add,row.name,'brief-add',()=>{
      ids.push(row.id); renderBrief(); renderResults();
      field('action-status').textContent=words.sent(row.name);
      field('search').focus();
    });
    add.disabled=selected || ids.length===3;
    li.append(details,add); list.append(li);
  }
}

function renderBrief() {
  revision++;
  brief=ids.length ? buildSchoolBrief(ids,directory,language) : null;
  const selected=field('selected'), link=field('share');
  selected.replaceChildren();
  field('count').textContent=words.count(ids.length);
  field('empty').hidden=!!brief;
  field('example').hidden=!!brief;
  field('example').disabled=!directory.ready;
  field('copy').disabled=field('print').disabled=!brief;
  field('copy-fallback').hidden=true; field('copy-fallback').value='';
  field('action-status').textContent='';
  const date=new Date(directory.retrievedAt);
  field('date').hidden=!brief || !Number.isFinite(date.getTime());
  if (!field('date').hidden) field('date').textContent=words.dated(new Intl.DateTimeFormat(language,{dateStyle:'long',timeZone:'UTC'}).format(date));
  link.setAttribute('aria-disabled',String(!brief));
  if (!brief) {link.removeAttribute('href'); return;}
  link.href=brief.shareUrl; link.target='_blank'; link.rel='noopener noreferrer';
  for (const row of brief.schools) {
    const li=el('li','','brief-card');
    li.append(el('h3',row.name,'brief-name'),el('p',describe(row),'brief-facts'),
      el('p',[row.address,row.city,[row.state,row.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '),'brief-address'));
    const links=el('div','','brief-links');
    if (row.website) links.append(externalLink(words.schoolSite,row.website));
    if (row.sourceUrl && row.sourceUrl!==row.website) links.append(externalLink(words.source,row.sourceUrl));
    const remove=action(words.remove,row.name,'brief-remove',()=>{
      const index=ids.indexOf(row.id); ids.splice(index,1);
      renderBrief(); renderResults(); field('action-status').textContent=words.removed(row.name);
      (selected.children[Math.min(index,ids.length-1)]?.querySelector('.brief-remove') || field('search')).focus();
    });
    li.append(links,remove); selected.append(li);
  }
}

function localize() {
  language=currentLanguage(); words=copy[language];
  document.title=words.title+' | Buggy Maps';
  for (const node of document.querySelectorAll('[data-i18n]')) node.textContent=words[node.dataset.i18n];
  field('back').href=language==='es'?'./?lang=es':'./';
  field('locator').href=districtSchoolLocator;
  const toggle=field('language');
  toggle.textContent=language==='en'?'Español':'English';
  toggle.lang=language==='en'?'es':'en';
  renderResults(); renderBrief();
}
async function load() {
  loadFailed=false; field('retry').hidden=true; renderResults();
  try {await directory.load();}
  catch {loadFailed=true; field('retry').hidden=false;}
  renderResults(); renderBrief();
}
field('search').addEventListener('input',renderResults);
field('retry').addEventListener('click',load);
field('language').addEventListener('click',()=>setLanguage(language==='en'?'es':'en'));
window.addEventListener('buggy-language-change',localize);
field('example').addEventListener('click',()=>{
  const sample=['fl-13-0841','fl-13-6741'];
  if (ids.length || !sample.every(id=>directory.get(id)?.campusType==='campus')) return;
  ids.push(...sample); renderBrief(); renderResults(); field('share').focus();
});
field('copy').addEventListener('click',async()=>{
  if (!brief) return;
  const current=revision, url=brief.shareUrl;
  const copied=await writePublicLink(url);
  if (revision!==current) return;
  field('action-status').textContent=copied?words.copied:words.manual;
  if (!copied) {
    const fallback=field('copy-fallback'); fallback.hidden=false; fallback.value=url; fallback.focus(); fallback.select();
  }
});
field('print').addEventListener('click',()=>{if (brief) window.print();});
localize();
load();
