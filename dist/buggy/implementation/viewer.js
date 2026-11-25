import {currentLanguage,setLanguage,setupLanguage} from '../language.js';

const files = [
  ['sharing','share-link.js','Sharing and clipboard','Enlaces y portapapeles'],
  ['parents','parent-actions.js','Parent choices and booking','Opciones para familias y reservas'],
  ['privacy','trip-location.js','Trip privacy and navigation','Privacidad del trayecto y navegación'],
  ['planner','trip-planner.js','Home-to-school directions','Indicaciones de casa a la escuela'],
  ['commutes','commute-workspace.js','Route comparison and arrival times','Comparación de rutas y horas de llegada'],
  ['roads','map-assets/road-network.js','Road-network routing','Rutas por la red vial'],
  ['search','place-search.js','Address and school search','Búsqueda de direcciones y escuelas'],
  ['area','area-search.js','Search this map area','Búsqueda en esta zona del mapa'],
  ['nearby','school-discovery.js','Nearby schools and filters','Escuelas cercanas y filtros'],
  ['schools','school-mode.js','School directory','Directorio escolar'],
  ['booking','buggy-schools.js','Official Buggy school links','Enlaces oficiales de Buggy'],
  ['saved','saved-places.js','Saved homes, schools and trips','Casas, escuelas y trayectos guardados'],
  ['map','map-engine.js','Interactive map and markers','Mapa interactivo y marcadores'],
  ['navigation','explore-modes.js','Homes, schools and directions modes','Modos de casas, escuelas e indicaciones'],
  ['layout','journey-layout.js','Touch and keyboard controls','Controles táctiles y de teclado'],
  ['styles','journey-layout.css','Map layout and visual styles','Diseño y estilos del mapa'],
  ['app','atlas.js','Map application','Aplicación del mapa']
];
const labels = {
  en:{title:'Map implementation',description:'Choose a feature to read or download the code running on the public map.',feature:'Feature',download:'Download file',back:'Back to map',language:'Español',loading:'Loading file…',error:'The file could not be loaded.',retry:'Retry',code:'Source code',lines:n=>n.toLocaleString('en-US')+' lines'},
  es:{title:'Código del mapa',description:'Elige una función para leer o descargar el código que usa el mapa público.',feature:'Función',download:'Descargar archivo',back:'Volver al mapa',language:'English',loading:'Cargando archivo…',error:'No se pudo cargar el archivo.',retry:'Reintentar',code:'Código fuente',lines:n=>n.toLocaleString('es-US')+' líneas'}
};
const el = id=>document.getElementById(id);
const select = el('feature'), link = el('download'), status = el('status');
let request, blobURL, lineCount=0, phase='loading';

function setStatus() {
  const t=labels[currentLanguage()];
  status.textContent=phase==='ready'?t.lines(lineCount):t[phase];
}
function updateLabels() {
  const lang=currentLanguage(),t=labels[lang];
  for(const id of ['title','description','download','back','language','retry']) el(id).textContent=t[id];
  el('feature-label').textContent=t.feature;
  el('code-view').setAttribute('aria-label',t.code);
  el('language').setAttribute('lang',lang==='es'?'en':'es');
  const map=lang==='es'?'../?lang=es':'../?lang=en';
  el('back').href=map;el('brand').href=map;
  files.forEach((file,i)=>{select.options[i].textContent=file[lang==='es'?3:2];});
  document.title=t.title+' · Buggy Maps';
  setStatus();
}
function chooseFromURL() {
  const code=new URLSearchParams(location.search).get('file');
  return files.find(file=>file[0]===code)||files[0];
}
async function show(file) {
  request?.abort();
  const active=new AbortController();request=active;
  if(blobURL){URL.revokeObjectURL(blobURL);blobURL=null;}
  select.value=file[0];
  phase='loading';setStatus();
  link.hidden=true;link.removeAttribute('href');
  el('retry').hidden=true;el('file').textContent=file[1];
  el('code').textContent='';el('code-view').setAttribute('aria-busy','true');
  el('code-view').scrollTop=0;el('code-view').scrollLeft=0;
  try {
    const response=await fetch(new URL('../'+file[1],import.meta.url),{signal:active.signal,cache:'no-cache'});
    if(!response.ok||/text\/html/i.test(response.headers.get('content-type')||''))throw Error();
    const source=await response.text();
    if(active.signal.aborted)return;
    if(!source.trim()||/^\s*<!doctype html/i.test(source))throw Error();
    el('code').textContent=source;
    lineCount=source.trimEnd().split('\n').length;
    blobURL=URL.createObjectURL(new Blob([source],{type:'text/plain;charset=utf-8'}));
    link.href=blobURL;link.download=file[1].split('/').pop();link.hidden=false;
    phase='ready';
  } catch {
    if(active.signal.aborted)return;
    phase='error';el('retry').hidden=false;
  } finally {
    if(!active.signal.aborted){setStatus();el('code-view').setAttribute('aria-busy','false');}
  }
}

setupLanguage();
for(const [id] of files)select.append(new Option('',id));
updateLabels();
select.addEventListener('change',()=>{
  const page=new URL(location.href);
  page.searchParams.set('file',select.value);
  history.replaceState(history.state,'',page);
  show(chooseFromURL());
});
el('retry').addEventListener('click',()=>show(chooseFromURL()));
el('language').addEventListener('click',()=>setLanguage(currentLanguage()==='es'?'en':'es'));
window.addEventListener('buggy-language-change',updateLabels);
show(chooseFromURL());
