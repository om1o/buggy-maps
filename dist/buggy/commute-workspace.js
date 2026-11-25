// Time and parking drafts live in this tab. The standard comparison link contains only schools.
import {publicSharing, publicMapURL} from './share-link.js';
import {rememberLocalComparison} from './trip-location.js';
const words = {
  en: {
    compare:'Compare school drives', from:'From', to:'To', add:'Add a school',
    find:'School name or ZIP', choose:'Choose up to three campuses.', noMatch:'No matching campuses.',
    full:'Three schools selected. Remove one to add another.', remove:'Remove', use:'View drive',
    estimating:'Finding road route…', failed:'Road estimate unavailable', retry:'Retry estimate',
    freeFlow:'Car estimates use Miami-Dade roads. Allow extra time for traffic and drop-off lines.',
    addFirst:'Type a school name or ZIP to add a campus.', searchError:'School search is temporarily unavailable.',
    plan:'Plan an arrival', arrival:'Arrive by', buffer:'Parking buffer (min)', leaving:'Leave by', previous:'previous day',
    daysAgo:n=>n+' days earlier', help:'Use Miami time. Car estimates exclude traffic and the drop-off line.', breakdown:(drive,parking)=>drive+' min driving + '+parking+' min parking',
    invalid:'Enter a time and a parking buffer between 0 and 120 minutes.', min:'min',
    print:'Print route card', card:'School drive', sketch:'Driving route outline', start:'Start',
    finish:'Finish', maps:'Directions', booking:'Check availability with Buggy',
    source:'Road data', trip:'Open this trip in Buggy Maps', local:'Miami time',
    planning:'Arrival plan', selected:n=>n+' of 3 selected',
    shareNeeds:'Two mapped schools are needed to share.',
    exposed:n=>'The link shows '+n+' schools. Your home address stays private.'
  },
  es: {
    compare:'Comparar trayectos', from:'Desde', to:'Hasta', add:'Añadir una escuela',
    find:'Nombre de la escuela o código postal', choose:'Elige hasta tres escuelas.', noMatch:'No hay sedes que coincidan.',
    full:'Hay tres escuelas. Quita una para añadir otra.', remove:'Quitar', use:'Ver trayecto',
    estimating:'Calculando la ruta…', failed:'Ruta sin estimación', retry:'Reintentar',
    freeFlow:'Los tiempos en auto se estiman con las calles de Miami-Dade. Deja más tiempo para el tráfico y la fila escolar.',
    addFirst:'Escribe un nombre o código postal para añadir una escuela.', searchError:'La búsqueda de escuelas no está disponible.',
    plan:'Planear la llegada', arrival:'Hora de llegada', buffer:'Para estacionar (min)', leaving:'Hora de salida', previous:'día anterior',
    daysAgo:n=>n+' días antes', help:'Usa la hora de Miami. El cálculo en auto excluye el tráfico y la fila escolar.', breakdown:(drive,parking)=>drive+' min en auto + '+parking+' min para estacionar',
    invalid:'Escribe una hora y un margen para estacionar de 0 a 120 minutos.', min:'min',
    print:'Imprimir la ruta', card:'Trayecto escolar', sketch:'Trazado del viaje en automóvil', start:'Salida',
    finish:'Llegada', maps:'Indicaciones', booking:'Consultar disponibilidad en Buggy',
    source:'Datos viales', trip:'Abrir este viaje en Buggy Maps', local:'Hora de Miami',
    planning:'Plan de llegada', selected:n=>n+' de 3 elegidas',
    shareNeeds:'Elige dos escuelas con ubicación para compartir.',
    exposed:n=>'El enlace muestra '+n+' escuelas. La dirección de casa se mantiene privada.'
  }
};

function make(tag, cls, value) {
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(value!==undefined)node.textContent=value;
  return node;
}
function button(label, cls, onClick) {
  const node=make('button',cls,label);
  node.type='button';
  node.addEventListener('click',onClick);
  return node;
}
function disclosure(label, cls) {
  const section=make('details','cw-disclosure '+cls);
  const summary=make('summary','cw-heading');
  summary.append(make('span','',label));
  section.append(summary);
  return section;
}
function schoolAddress(row) {
  return [row.address,row.city,[row.state,row.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}
function clock(minutes,language) {
  // A wall-clock input supplied for Miami. Formatting uses UTC to avoid the browser's time zone.
  return new Intl.DateTimeFormat(language==='es'?'es-US':'en-US',{
    hour:'numeric',minute:'2-digit',timeZone:'UTC'
  }).format(new Date(Date.UTC(2000,0,1,0,minutes)));
}

export function leaveBy(arrival,buffer,durationSeconds) {
  const time=/^(\d{2}):(\d{2})$/.exec(arrival);
  if(!time||Number(time[1])>23||Number(time[2])>59||
      (typeof buffer!=='number' && !/^\d{1,3}$/.test(String(buffer)))||
      !Number.isInteger(Number(buffer))||Number(buffer)<0||Number(buffer)>120||
      !Number.isFinite(durationSeconds)||durationSeconds<0)return null;
  const arrive=Number(time[1])*60+Number(time[2]);
  const driveMinutes=Math.ceil(durationSeconds/60);
  const departure=arrive-driveMinutes-Number(buffer);
  return {arrive,driveMinutes,buffer:Number(buffer),departure:((departure%1440)+1440)%1440,dayOffset:Math.floor(departure/1440)};
}

function daySuffix(offset,t) {
  return offset===-1?' · '+t.previous:offset<0?' · '+t.daysAgo(-offset):'';
}
export function driveFacts(route,language) {
  if(!route||!Number.isFinite(route.durationSeconds)||route.durationSeconds<0||
      !Number.isFinite(route.distanceMeters)||route.distanceMeters<0)return null;
  const number=new Intl.NumberFormat(language==='es'?'es-US':'en-US',{maximumFractionDigits:1});
  const miles=route.distanceMeters/1609.344;
  const minutes=Math.ceil(route.durationSeconds/60);
  return {
    time:number.format(minutes)+' min',
    distance:miles>=.1?number.format(miles)+' mi':number.format(Math.round(route.distanceMeters/.3048))+' ft'
  };
}

// Keep route geometry proportional to longitude at the route's latitude.
export function routeDrawing(coordinates) {
  if(!Array.isArray(coordinates)||coordinates.length<2||!coordinates.every(p=>
    Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])))return null;
  const first=coordinates[0];
  const latitude=(first[0]+coordinates.at(-1)[0])/2;
  const lonScale=Math.cos(latitude*Math.PI/180);
  const points=coordinates.map(([lat,lon])=>[(lon-first[1])*lonScale,first[0]-lat]);
  let minX=0,minY=0,maxX=0,maxY=0;
  for(const [x,y] of points){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}
  const dx=maxX-minX,dy=maxY-minY;
  const scale=dx||dy?Math.min(dx?244/dx:Infinity,dy?112/dy:Infinity):1;
  const left=(280-dx*scale)/2,top=(148-dy*scale)/2;
  const fitted=points.map(([x,y])=>[+(left+(x-minX)*scale).toFixed(2),+(top+(y-minY)*scale).toFixed(2)]);
  return {points:fitted.map(p=>p.join(',')).join(' '),first:fitted[0],last:fitted.at(-1)};
}

function routePicture(drawing,t) {
  const ns='http://www.w3.org/2000/svg';
  function part(tag,attrs){
    const node=document.createElementNS(ns,tag);
    Object.entries(attrs).forEach(([k,v])=>node.setAttribute(k,String(v)));
    return node;
  }
  const svg=part('svg',{viewBox:'0 0 280 148',role:'img','aria-label':t.sketch});
  svg.append(part('polyline',{points:drawing.points,fill:'none',stroke:'#124f9e','stroke-width':3.5,'stroke-linejoin':'round','stroke-linecap':'round'}));
  const [ax,ay]=drawing.first,[bx,by]=drawing.last;
  svg.append(part('circle',{cx:ax,cy:ay,r:4.6,fill:'white',stroke:'#124f9e','stroke-width':2.5}),
    part('rect',{x:bx-3.8,y:by-3.8,width:7.6,height:7.6,rx:1.3,fill:'#07376c'}));
  return svg;
}

const publicId=/^[a-z0-9][a-z0-9-]{0,63}$/;
function comparable(row) {
  return row && typeof row.id==='string' && publicId.test(row.id) && (!row.campusType || row.campusType==='campus') &&
    Number.isFinite(row.lat) && Number.isFinite(row.lng) && Math.abs(row.lat)<=90 && Math.abs(row.lng)<=180;
}
export function readComparison(value,getSchool) {
  if(typeof value!=='string'||!getSchool)return [];
  const rows=[],seen=new Set();
  for(const token of value.slice(0,1024).split(',')){
    const id=token.trim().toLowerCase();
    if(!publicId.test(id)||seen.has(id))continue;
    seen.add(id);
    const row=getSchool(id);
    if(row?.id===id&&comparable(row))rows.push(row);
    if(rows.length===3)break;
  }
  return rows;
}

export function comparisonSlots(value,count) {
  if(typeof value!=='string'||!/^[1-3](,[1-3]){0,2}$/.test(value))return null;
  const slots=value.split(',').map(n=>Number(n)-1);
  return slots.length===count&&new Set(slots).size===count?slots:null;
}

export function comparisonURL(base,home,schools,{reverse=false,language='en',positions,aerial=false}={}) {
  if(!home||home.withheld||typeof home.id!=='string'||!publicId.test(home.id))return '';
  const ids=[...new Set(schools.filter(comparable).map(row=>row.id))].slice(0,3);
  if(ids.length<2)return '';
  const url=new URL(base);url.hash='';url.search='';
  url.searchParams.set('mode','route');url.searchParams.set('home',home.id);
  url.searchParams.set('compare',ids.join(','));
  if(positions){
    const labels=ids.map(id=>positions.get(id)+1).join(',');
    if(comparisonSlots(labels,ids.length)?.some((slot,i)=>slot!==i))url.searchParams.set('slots',labels);
  }
  if(reverse)url.searchParams.set('dir','return');
  if(language==='es')url.searchParams.set('lang','es');
  if(aerial)url.searchParams.set('layer','aerial');
  return url.href;
}

export function createCommuteWorkspace() {
  let comparedHome='',chosen=[],compareOpened=false,sharedSelection='';
  const drafts=new Map(),positions=new Map();
  function positionFor(id) {
    if(!positions.has(id)){
      const used=new Set(positions.values());
      positions.set(id,[0,1,2].find(position=>!used.has(position)));
    }
    return positions.get(id);
  }
  function orderedSchools(){
    return chosen.slice().sort((a,b)=>positionFor(a.id)-positionFor(b.id));
  }
  let number=0;
  function mountCompare({parent,home,school,language,reverse,getSchools,getSchool,comparisonSaved,compare,slots,signal,chooseRoute,showComparison,onSelectionCount}) {
    if(!home?.id)return;
    const t=words[language];
    if(comparedHome!==home.id){chosen=[];positions.clear();comparedHome=home.id;compareOpened=false;sharedSelection='';}
    const selectionKey=(ids,labels)=>home.id+'|'+String(ids||'').slice(0,1024)+'|'+String(labels||'').slice(0,6);
    const hasSelection=comparisonSaved||Boolean(compare);
    const signature=hasSelection?selectionKey(compare,slots):'';
    const openShared=Boolean(signature && signature!==sharedSelection);
    if(openShared){
      chosen=readComparison(compare,getSchool);positions.clear();
      const sharedSlots=chosen.map(row=>row.id).join(',')===compare?comparisonSlots(slots,chosen.length):null;
      chosen.forEach((row,index)=>positions.set(row.id,sharedSlots?.[index]??index));compareOpened=chosen.length>0;
    }else if(!hasSelection && comparisonSaved===false){
      chosen=[];positions.clear();
      if(sharedSelection)compareOpened=false;
    }
    sharedSelection=signature;
    const box=disclosure(t.compare,'cw-compare');
    const body=make('div','cw-content');
    const selectedCount=make('small','cw-summary-detail');
    const title=box.querySelector('summary');title.append(selectedCount);title.after(body);
    if(chosen.length)selectedCount.textContent=t.selected(chosen.length);
    parent.append(box);
    let built=false,searchRevision=0,active=-1,suggestions=[];
    const jobs=new Map();
    function publishComparison() {
      if(signal.aborted)return;
      onSelectionCount?.(box.open?chosen.length:0);
      if(typeof showComparison!=='function')return;
      const visible=box.open?orderedSchools().flatMap(school=>{
        const coordinates=jobs.get(school.id)?.coordinates;
        return coordinates?[{home,school,coordinates,position:positionFor(school.id)}]:[];
      }):[];
      showComparison(visible);
    }
    const rows=make('ol','cw-schools');
    const caption=make('p','cw-context',(reverse?t.to:t.from)+' '+home.address+' · '+t.choose);
    const add=make('label','cw-label',t.add);
    const input=make('input','cw-input');
    input.type='search';input.autocomplete='off';input.placeholder=t.find;input.maxLength=140;input.spellcheck=false;
    const id='cw-schools-'+(++number);
    input.id=id;add.htmlFor=id;
    input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');
    const menu=make('ul','cw-matches');menu.id=id+'-results';menu.hidden=true;menu.setAttribute('role','listbox');
    menu.setAttribute('aria-label',t.add);input.setAttribute('aria-controls',menu.id);
    input.setAttribute('aria-expanded','false');
    const feedback=make('p','cw-context');feedback.setAttribute('role','status');
    const search=make('div','cw-add');
    search.append(add,input,menu,feedback);
    const source=make('p','cw-footnote',t.freeFlow);
    const shareSection=make('div','cw-compare-share');
    const sharingNote=make('p','cw-footnote');
    const share=publicSharing({kind:'comparison',language,signal,
      getSchools:()=>orderedSchools().filter(comparable),homeAddress:home.address,
      getExactURL:()=>comparisonURL(publicMapURL,home,orderedSchools(),{reverse,language,positions,
        aerial:new URLSearchParams(location.search).get('layer')==='aerial'})});
    const shareActions=make('div','cw-route-actions');
    shareActions.append(share.trigger,share.open,share.parentTrigger);
    shareSection.append(shareActions,sharingNote,share.panel);
    function closeResults() {
      searchRevision++;active=-1;suggestions=[];menu.hidden=true;menu.replaceChildren();
      input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');feedback.textContent='';
    }
    function update() {
      const mapped=chosen.filter(comparable).length;
      share.refresh();
      shareSection.hidden=chosen.length<2;
      sharingNote.textContent=mapped>=2?t.exposed(mapped):t.shareNeeds;
      selectedCount.textContent=chosen.length?t.selected(chosen.length):'';
      rows.replaceChildren(...orderedSchools().map(x=>jobs.get(x.id)?.element).filter(Boolean));
      publishComparison();
      input.disabled=chosen.length>=3;
      if(input.disabled) {closeResults(); feedback.textContent=t.full;}
      else if(!input.value)feedback.textContent=chosen.length?'':t.addFirst;
    }
    function rememberChoices() {
      const choices=orderedSchools().map(row=>({id:row.id,position:positionFor(row.id)}));
      const stored=rememberLocalComparison(home.id,choices);
      if(stored)sharedSelection=selectionKey(stored.get('compare'),stored.get('slots'));
    }
    function addSchool(item) {
      if(!item||signal.aborted||chosen.length>=3||chosen.some(x=>x.id===item.id))return;
      chosen.push(item);addRow(item);input.value='';closeResults();update();rememberChoices();
    }
    function changeActive(index) {
      if(!suggestions.length)return;
      active=(index+suggestions.length)%suggestions.length;
      Array.from(menu.children).forEach((option,i)=>option.setAttribute('aria-selected',String(i===active)));
      const choice=menu.children[active];
      input.setAttribute('aria-activedescendant',choice.id);choice.scrollIntoView?.({block:'nearest'});
    }
    async function find() {
      closeResults();
      const term=input.value.trim(),revision=searchRevision;
      if(!term || input.disabled || signal.aborted)return;
      try{
        const items=await getSchools(term);
        if(signal.aborted||revision!==searchRevision)return;
        const selectedIds=new Set(chosen.map(row=>row.id));
        suggestions=(Array.isArray(items)?items:[]).filter(s=>s?.id&&s.name&&(!s.campusType||s.campusType==='campus')&&!selectedIds.has(s.id)).slice(0,6);
        if(!suggestions.length){feedback.textContent=t.noMatch;return;}
        suggestions.forEach((s,i)=>{
          const entry=make('li','cw-match');entry.id=menu.id+'-'+i;
          entry.setAttribute('role','option');entry.setAttribute('aria-selected','false');
          entry.append(make('strong','',s.name),make('small','',schoolAddress(s)));
          entry.addEventListener('pointerdown',e=>e.preventDefault());
          entry.addEventListener('click',()=>addSchool(s));menu.append(entry);
        });
        menu.hidden=false;input.setAttribute('aria-expanded','true');
      }catch{if(!signal.aborted&&revision===searchRevision)feedback.textContent=t.searchError;}
    }
    input.addEventListener('input',find);input.addEventListener('blur',closeResults);
    input.addEventListener('keydown',e=>{
      if(e.key==='Escape'){closeResults();return;}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();if(suggestions.length)changeActive(active+(e.key==='ArrowDown'?1:-1));
      }else if(e.key==='Enter'&&suggestions.length){
        e.preventDefault();addSchool(suggestions[active<0?0:active]);
      }
    });
    function addRow(item) {
      const row=make('li','cw-compare-row');
      const heading=make('div','cw-school-heading');
      const remove=button('×','cw-remove',()=>{
        const job=jobs.get(item.id);job?.request?.abort();jobs.delete(item.id);positions.delete(item.id);
        chosen=chosen.filter(s=>s.id!==item.id);closeResults();update();rememberChoices();input.focus();
      });
      remove.setAttribute('aria-label',t.remove+' '+item.name);remove.title=t.remove;
      const position=positionFor(item.id);
      const badge=make('span','cw-route-number',String(position+1));
      badge.dataset.position=String(position);
      heading.append(badge,make('strong','',item.name),remove);
      const estimates=make('p','cw-estimates');estimates.setAttribute('role','status');
      const use=button(t.use,'cw-route-link',()=>{
        compareOpened=false;box.open=false;showComparison?.([]);
        chooseRoute(item);
      });
      use.addEventListener('pointerdown',event=>event.preventDefault());
      use.setAttribute('aria-label',t.use+' · '+item.name);
      row.append(heading,make('small','cw-address',schoolAddress(item)),estimates,use);
      const job={element:row,request:null,coordinates:null}; jobs.set(item.id,job);
      async function estimate() {
        job.request?.abort();const request=new AbortController();job.request=request;
        estimates.textContent=t.estimating;
        try{
          const {calculateDrive}=await import('./trip-routing.js');
          if(signal.aborted||request.signal.aborted)return;
          const result=await calculateDrive(reverse?item:home,reverse?home:item,{signal:request.signal});
          if(signal.aborted||request.signal.aborted)return;
          const facts=driveFacts(result,language);
          if(!facts||!Array.isArray(result.coordinates)||result.coordinates.length<2)throw Error('Invalid estimate');
          job.coordinates=result.coordinates;
          estimates.textContent=facts.time+' · '+facts.distance;
          publishComparison();
        }catch{
          if(signal.aborted||request.signal.aborted)return;
          job.coordinates=null;publishComparison();
          estimates.replaceChildren(make('span','',t.failed));
          if([home,item].every(x=>Number.isFinite(x.lat)&&Number.isFinite(x.lng))){
            estimates.append(button(t.retry,'cw-retry',estimate));
          }
        }
      }
      estimate();
    }
    function show() {
      if(signal.aborted)return;
      compareOpened=box.open;
      if(!box.open||built){publishComparison();return;}
      built=true;
      if(!chosen.length && !hasSelection && school?.id && (!school.campusType||school.campusType==='campus'))chosen.push(school);
      body.append(caption,rows,search,source,shareSection);
      chosen.forEach(addRow);update();
    }
    box.addEventListener('toggle',show);
    signal.addEventListener('abort',()=>{
      closeResults();for(const job of jobs.values())job.request?.abort();
      showComparison?.([]);
    },{once:true});
    if(compareOpened){box.open=true;show();}
    if(openShared&&compareOpened)queueMicrotask(()=>{
      if(signal.aborted||!title.isConnected)return;
      title.focus({preventScroll:true});title.scrollIntoView?.({block:'nearest'});
    });
  }

  function mountArrival({parent,home,school,language,reverse,route}) {
    const t=words[language],key=[home.id,school.id,reverse?'return':'out'].join('|');
    const browserHistory=globalThis.history;
    const prior=browserHistory?.state?.buggyArrivalPlan;
    if(prior?.route===key && typeof prior.open==='boolean' &&
        (prior.time==='' || /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(prior.time)) &&
        /^\d{1,3}$/.test(prior.buffer) && Number(prior.buffer)<=120) {
      drafts.set(key,{time:prior.time,buffer:prior.buffer,open:prior.open});
    }
    if(!drafts.has(key))drafts.set(key,{time:'',buffer:'10',open:false});
    const draft=drafts.get(key),box=disclosure(t.plan,'cw-arrival');
    function saveInThisTab() {
      const entry=browserHistory?.state;
      if(!entry || !box.isConnected)return;
      const previous=entry.buggyArrivalPlan;
      if(previous?.route===key && previous.time===draft.time &&
          previous.buffer===draft.buffer && previous.open===draft.open)return;
      try{browserHistory.replaceState({...entry,buggyArrivalPlan:{route:key,...draft}},'');}
      catch{/* The in-memory draft remains available if this browser declines a history write. */}
    }
    const departureTime=make('small','cw-summary-detail');box.querySelector('summary').append(departureTime);
    const contents=make('div','cw-content');
    const fields=make('div','cw-time-fields');
    function field(title,input) {const label=make('label','cw-label');label.append(make('span','',title),input);return label;}
    const time=make('input','cw-input');time.type='time';time.value=draft.time;
    const buffer=make('input','cw-input');buffer.type='number';buffer.min='0';buffer.max='120';buffer.step='1';buffer.inputMode='numeric';buffer.value=draft.buffer;
    fields.append(field(t.arrival,time),field(t.buffer,buffer));
    const result=make('p','cw-departure');result.setAttribute('role','status');
    contents.append(fields,result,make('p','cw-footnote',t.help));box.append(contents);parent.append(box);
    box.open=draft.open;box.addEventListener('toggle',()=>{draft.open=box.open;saveInThisTab();});
    function refresh() {
      draft.time=time.value;draft.buffer=buffer.value;
      const plan=leaveBy(draft.time,draft.buffer,route.durationSeconds);
      result.hidden=!draft.time;
      departureTime.textContent=plan?clock(plan.departure,language)+daySuffix(plan.dayOffset,t):'';
      if(!plan){result.textContent=draft.time?t.invalid:'';return;}
      result.replaceChildren(make('span','',t.leaving),
        make('strong','',clock(plan.departure,language)+daySuffix(plan.dayOffset,t)),
        make('small','',t.local+' · '+t.breakdown(plan.driveMinutes,plan.buffer)));
    }
    for(const field of [time,buffer]){
      const edited=()=>{refresh();saveInThisTab();};
      field.addEventListener('input',edited);field.addEventListener('change',edited);
    }
    refresh();
    return ()=>leaveBy(draft.time,draft.buffer,route.durationSeconds);
  }

  function printCard({home,school,language,reverse,route,links,shareURL,bookingURL,plan,signal}) {
    const t=words[language],facts=driveFacts(route,language),drawing=routeDrawing(route.coordinates);
    if(signal.aborted||!facts||!drawing)return;
    let card=document.querySelector('.cw-print-host');
    if(!card){card=make('article','cw-print-host');document.body.append(card);}
    const host=card;card.lang=language;card.replaceChildren();
    const brand=make('img','cw-print-brand');brand.src=new URL('./assets/buggy-logo.png',import.meta.url).href;brand.alt='Buggy';
    card.append(brand,make('h1','',t.card));
    const here=make('div','cw-print-body');
    const from=reverse?school:home,to=reverse?home:school;
    const detail=make('div','cw-print-itinerary');
    function stop(label,place){
      const line=make('div','cw-print-stop');line.append(make('small','',label),make('strong','',place.name||place.address));
      const address=place.name?schoolAddress(place):[place.city,place.state,place.zip].filter(Boolean).join(' ');
      if(address)line.append(make('span','',address));return line;
    }
    detail.append(stop(t.start,from),stop(t.finish,to));
    here.append(detail,routePicture(drawing,t));card.append(here);
    card.append(make('p','cw-print-total',facts.time+' · '+facts.distance),make('p','',t.freeFlow));
    if(plan) {
      const timing=make('div','cw-print-time');
      timing.append(make('h2','',t.planning+' · '+t.local),make('p','',t.leaving+' '+clock(plan.departure,language)+daySuffix(plan.dayOffset,t)+' · '+t.arrival+' '+clock(plan.arrive,language)),make('p','',t.buffer+' · '+plan.buffer));card.append(timing);
    }
    const name=typeof route.source==='string'?route.source:route.source?.name;
    if(name)card.append(make('p','cw-print-source',t.source+' · '+name));
    const resources=make('nav','cw-print-links');resources.setAttribute('aria-label',t.maps);
    for(const [label,href] of [['Apple Maps',links.apple],['Google Maps',links.google],[t.booking,bookingURL],[t.trip,shareURL]]) {
      if(!href)continue;
      const link=make('a','',label);link.href=href;resources.append(link);
    }
    card.append(resources,make('p','cw-print-url',shareURL));
    document.body.classList.add('cw-printing');
    const cleanup=()=>{if(host.isConnected)host.remove();document.body.classList.remove('cw-printing');};
    window.addEventListener('afterprint',cleanup,{once:true});
    signal.addEventListener('abort',()=>{window.removeEventListener('afterprint',cleanup);cleanup();},{once:true});
    window.print();
  }
  return {mountCompare,mountArrival,printCard};
}

export function printRouteButton(language,onPrint) {
  const t=words[language],node=button(t.print,'tp-secondary cw-print-action',onPrint);
  return node;
}
