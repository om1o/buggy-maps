import { createSchoolDirectory } from './school-mode.js';
import { currentLanguage, setLanguage } from './language.js';
import { schoolFiltersFrom, schoolSearchResults, renderSchoolFilters, renderNearbySchools, sharedSchools, renderSharedSchools } from './school-discovery.js';
import { parseArea, rowsInArea } from './area-search.js';
import { currentMapParams, publicMapParams, setMapHref, replaceMapLocation } from './trip-location.js';

const el=id=>document.getElementById(id);
const copy=(en,es)=>currentLanguage()==='es'?es:en;
const completeURL=currentMapParams;
const modeOf=p=>p.has('campuses')?'schools':p.has('property')?'homes':['schools','route'].includes(p.get('mode'))?p.get('mode'):'homes';

export function createExploreModes({explorer, getHomes, getHome, resolveHome, homesReady, homesFailed, retryHomes, navigate, refresh}) {
  const schools=createSchoolDirectory();
  const panel=el('trip-panel'), input=el('query'), search=el('search');
  let plannerPromise, planner, revision=0, pendingHome=false, paintKey='', lastDrawnKey='', countyRead, shortlistScope;
  function go(state) {
    const p=new URLSearchParams();
    for(const key of ['mode','home','school','q','map','dir','lang']) if(state[key])p.set(key,state[key]);
    const previous=completeURL();
    if(state.mode==='route' && previous.get('mode')==='route' && state.home && state.home===previous.get('home')){
      for(const key of ['compare','slots'])if(previous.has(key))p.set(key,previous.get(key));
    }
    if(state.mode==='schools' && modeOf(previous)==='schools'){
      for(const key of ['area','grade','type','mapped','partner'])if(previous.has(key))p.set(key,previous.get(key));
    }
    navigate(p);
  }
  const setSourceCount=()=>{if(schools.ready)el('schools-count').textContent=schools.all.length.toLocaleString(currentLanguage());};
  const warmSchools=()=>schools.load().then(setSourceCount).catch(()=>{});
  function schoolMatches(text){
    const p=completeURL();
    const rows=schools.search(text);
    if(p.has('campuses')){
      const selected=new Set(sharedSchools(p,schools.get).map(s=>s.id));
      return rows.filter(s=>selected.has(s.id));
    }
    if(current()!=='schools')return rowsInArea(rows,parseArea(p.get('area')));
    return rowsInArea(schoolSearchResults(rows,schoolFiltersFrom(p)),parseArea(p.get('area')));
  }
  function nearby(parent,home){
    if(!parent||home.withheld||!Number.isFinite(home.lat)||!Number.isFinite(home.lng))return;
    const lang=currentLanguage();
    const show=()=>{
      if(!parent.isConnected||currentLanguage()!==lang)return;
      renderNearbySchools(parent,{home,schools:schools.all,language:lang,
        onSchool:school=>go({mode:'schools',home:home.id,school:school.id}),
        onRoute:school=>go({mode:'route',home:home.id,school:school.id})});
    };
    if(schools.ready){show();return;}
    schools.load().then(()=>{setSourceCount();show();}).catch(()=>{
      if(!parent.isConnected)return;
      const button=document.createElement('button');button.type='button';button.className='map-secondary';
      button.textContent=copy('Retry nearby schools','Volver a buscar escuelas cercanas');
      button.onclick=()=>{button.remove();nearby(parent,home);};parent.append(button);
    });
  }
  function ensurePlanner(){
    if(!plannerPromise)plannerPromise=import('./trip-planner.js').then(({createTripPlanner})=>{
      planner=createTripPlanner({panel,getHomes, getSchools:s=>schools.search(s),getHome,getSchool:id=>schools.get(id),
        getLanguage:currentLanguage,navigate:go,showRoute:t=>explorer.paintRoute(t),showComparison:routes=>explorer.paintComparison(routes),clearRoute:()=>explorer.clearRoute()});
      return planner;
    }).catch(error=>{plannerPromise=null;throw error;});
    return plannerPromise;
  }
  function current(){return modeOf(completeURL());}
  function preferredMarker(p) {
    return modeOf(p)==='schools'||(modeOf(p)==='route'&&p.has('home'))?'schools':'homes';
  }
  function headers(p) {
    if(p.has('campuses'))p=publicMapParams(p);
    const mode=modeOf(p),lang=currentLanguage(),layer=p.get('layer')==='aerial'?'aerial':'streets';
    document.body.dataset.atlasMode=mode;
    const implementation=el('map-implementation');
    if(implementation)implementation.href='./implementation/?lang='+lang;
    for(const a of document.querySelectorAll('[data-mode]')){
      if(a.dataset.mode===mode)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
      const next=new URLSearchParams();
      if(a.dataset.mode!=='homes')next.set('mode',a.dataset.mode);
      const home=p.get('home')||p.get('map')||p.get('property'), school=p.get('school');
      if(a.dataset.mode==='route'){if(home)next.set('home',home);if(school)next.set('school',school);}
      if(a.dataset.mode==='schools'){if(school)next.set('school',school);if(home)next.set('home',home);}
      if(a.dataset.mode==='homes'){if(home)next.set('map',home);if(school)next.set('school',school);}
      if(mode!=='route' && a.dataset.mode!=='route' && p.has('area'))next.set('area',p.get('area'));
      if(a.dataset.mode==='schools' && mode==='schools')for(const k of ['grade','type','mapped','partner'])if(p.has(k))next.set(k,p.get(k));
      if(lang==='es')next.set('lang','es');
      if(layer==='aerial')next.set('layer',layer);
      setMapHref(a,next);
    }
    const button=el('choose-language');
    button.textContent=lang==='es'?'EN':'ES';
    button.setAttribute('aria-label',lang==='es'?'English':'Español');
    for(const b of document.querySelectorAll('[data-layer]'))b.setAttribute('aria-pressed',String(b.dataset.layer===layer));
    explorer.setBasemap(layer);
    search.hidden=mode==='route'||p.has('campuses');
    const searchLabel=copy('Search an address, school or ZIP','Busca una dirección, escuela o código postal');
    if(!input.disabled || mode==='schools')input.placeholder=searchLabel;
    input.setAttribute('aria-label',searchLabel);
    search.querySelector('[type=submit]').setAttribute('aria-label',copy('Search homes and schools','Buscar viviendas y escuelas'));
  }
  function layerChange(name){
    const p=completeURL();
    if(name==='aerial')p.set('layer','aerial');else p.delete('layer');
    replaceMapLocation(p);
    headers(p);
    window.dispatchEvent(new Event('buggy-basemap-change'));
  }
  for(const b of document.querySelectorAll('[data-layer]'))b.addEventListener('click',()=>layerChange(b.dataset.layer));
  el('choose-language').addEventListener('click',()=>setLanguage(currentLanguage()==='es'?'en':'es'));
  window.addEventListener('buggy-language-change',()=>refresh());
  function schoolPin(school) {
    const p=completeURL();
    if(p.has('campuses')){go({mode:'schools',school:school.id});return;}
    if(current()==='route'){go({mode:'route',school:school.id, home:p.get('home'),dir:p.get('dir')});return;}
    go({mode:'schools',school:school.id,home:p.get('home')||p.get('map')||p.get('property'),q:current()==='schools'?p.get('q'):null});
  }
  function routeHome(home){const p=completeURL();go({mode:'route',home:home.id,school:p.get('school'),dir:p.get('dir')});}
  function schoolSearch(query) {
    const matches=schoolMatches(query), exact=matches.filter(s=>s.name.toLowerCase()===query.trim().toLowerCase());
    if(query.trim() && (exact.length===1||matches.length===1)){schoolPin(exact[0]||matches[0]);return;}
    go({mode:'schools',q:query.trim(),home:completeURL().get('home')});
  }
  function statusMessage(message,retry) {
    panel.replaceChildren();
    const node=document.createElement('p');node.className='explore-loading';node.role='status';node.textContent=message;panel.append(node);
    if(retry){const b=document.createElement('button');b.className='map-secondary';b.type='button';b.textContent=copy('Try again','Reintentar');b.onclick=()=>{lastDrawnKey='';if(retry==='homes'){retryHomes();}refresh();};panel.append(b);}
  }
  function leave(){
    revision++;countyRead?.abort();shortlistScope?.abort();pendingHome=false;lastDrawnKey='';paintKey='';
    if(planner)planner.dispose();
  }
  async function render(p) {
    const shortlist=p.has('campuses');
    if(shortlist)p=publicMapParams(p);
    const token=++revision,mode=modeOf(p),q=p.get('q')||'', key=[mode,p.get('home'),p.get('school'),q,p.get('dir'),p.has('compare')?'compare:'+p.get('compare'):'',p.get('slots'),p.get('area'),p.get('type'),p.get('grade'),p.get('mapped'),p.get('partner'),shortlist?'list:'+p.get('campuses'):'',currentLanguage()].join('|');
    headers(p);
    const homeId=p.get('home'),needHomes=Boolean(mode==='route'&&homeId&&!homesReady());
    if(key===lastDrawnKey && key===paintKey && !pendingHome)return;
    if(paintKey!==key){
      countyRead?.abort();shortlistScope?.abort();planner?.dispose();explorer.clearRoute();
      lastDrawnKey='';paintKey=key;
    }
    el('home').hidden=false;el('property').hidden=true;
    const schoolLabel=mode==='schools'?q:'';
    input.value=schoolLabel;
    input.disabled=!schools.ready;
    search.querySelector('[type=submit]').disabled=!schools.ready;
    el('clear-search').hidden=!input.value;
    el('index-progress').hidden=true;
    if(!schools.ready||(!shortlist&&!planner)||needHomes){
      explorer.showSchools({rows:[],key:'loading:'+key,markers:preferredMarker(p)});
      statusMessage(copy('Opening the map…','Abriendo el mapa…'));
    }
    pendingHome=needHomes;
    try {
      const [, ui]=await Promise.all([schools.load(),shortlist?null:ensurePlanner()]);
      if(token!==revision||current()!==mode)return;
      setSourceCount();
      if(shortlist){
        const rows=sharedSchools(p,schools.get),language=currentLanguage();
        explorer.showSchools({rows,all:schools.all,key,mode:'school-search',markers:'schools'});
        shortlistScope?.abort();shortlistScope=new AbortController();
        renderSharedSchools(panel,{schools:rows,language,signal:shortlistScope.signal});
        document.title=copy('Shared schools','Escuelas compartidas')+' · Buggy';
        lastDrawnKey=key;
        return;
      }
      if(needHomes && !homesReady()){
        if(homesFailed())statusMessage(copy('The home record could not load. Retry to see the route.','No se pudo cargar la vivienda. Reintenta para ver la ruta.'),'homes');
        return;
      }
      pendingHome=false;
      const school=schools.get(p.get('school'));
      let home=getHome(homeId);
      if(!home && homesReady() && /^county-\d{13}$/.test(homeId||'') && resolveHome){
        countyRead?.abort();countyRead=new AbortController();
        const request=countyRead;
        try{home=await resolveHome(homeId,request.signal);}catch{
          if(token!==revision||request.signal.aborted)return;
          statusMessage(copy('The county address could not load. Retry to plan the route.','No se pudo cargar la dirección del condado. Reintenta para planear la ruta.'),true);
          return;
        }
        if(token!==revision||request.signal.aborted)return;
      }
      let message='';
      if(p.has('school')&&!school)message=copy('This school ID is unavailable. Choose another school.','No se encuentra esta escuela. Elige otra.');
      if(homeId&&!home)message=copy('This home ID is unavailable. Choose another home.','No se encuentra esta vivienda. Elige otra.');
      const settings=schoolFiltersFrom(p), area=mode==='schools'?parseArea(p.get('area')):null;
      const filtered=mode==='schools' && Boolean(area||settings.type||settings.grade||settings.partner||settings.mapped);
      const schoolRows=mode==='schools'?rowsInArea(schoolSearchResults(schools.search(q),settings),area):schools.search(q),markers=preferredMarker(p),sideRows=markers==='homes'?getHomes(''):schoolRows;
      const selected=markers==='homes'?home:school;
      const mapMode=mode==='schools'&&(q||filtered)&&!school?'school-search':mode==='schools'?'school':'route';
      explorer.showSchools({rows:sideRows,all:markers==='homes'?sideRows:schools.all,row:selected,key,mode:mapMode,markers,area});
      search.querySelector('[type=submit]').disabled=false;input.disabled=false;search.setAttribute('aria-busy','false');
      if(school && mode==='schools')input.value=school.name;
      el('clear-search').hidden=!input.value;
      document.title=(school?.name || copy(mode==='schools'?'Miami-Dade schools':'School directions',mode==='schools'?'Escuelas de Miami-Dade':'Cómo llegar a la escuela'))+' · Buggy';
      lastDrawnKey=key;
      ui.render({mode,home,school,language:currentLanguage(),direction:p.get('dir')==='return'?'return':'outbound',schools:schoolRows,query:q,schoolTotal:(filtered||q)?schoolRows.length:schools.all.length,filtered,comparisonSaved:p.has('compare'),compare:p.get('compare')||'',slots:p.get('slots')||'',autoRoute:true});
      if(mode==='schools'&&!school){
        const host=document.createElement('div');
        const intro=panel.querySelector('.tp-intro');if(intro)intro.after(host);else panel.prepend(host);
        renderSchoolFilters(host,{params:p,language:currentLanguage(),rows:rowsInArea(schools.search(q),area),onChange:next=>{
          next.set('mode','schools');next.delete('school');navigate(next);
        }});
      }
      if(message){const note=document.createElement('p');note.textContent=message;note.className='atlas-map-context';note.role='status';panel.prepend(note);}
    }catch{
      if(token===revision){statusMessage(copy('The school directory could not open. Your home map is still available.','No se pudo abrir el directorio de escuelas. El mapa de viviendas sigue disponible.'),true);lastDrawnKey='';}
    }
  }
  return {current,headers,layerChange,schoolPin,routeHome,schoolSearch,schoolMatches,schoolsReady:()=>schools.ready,nearby,render,leave,warmSchools,
    homeDataReady(){if(current()!=='homes' && (pendingHome || current()==='route' && !completeURL().has('home') || current()==='schools' && completeURL().has('home'))){lastDrawnKey='';refresh();}}};
}
