import { setupLanguage, withLanguage, currentLanguage } from './language.js';
import { currentMapParams, publicMapParams, setMapHref, intentForMapLink, writeMapLocation, replaceMapLocation, protectIncomingMapLocation } from './trip-location.js';
import { createExploreModes } from './explore-modes.js';
import { normalize, indexRow, exactStreet, hasPhotoGallery, wantsCounty, countyAddress, parseSearch, findProperties, priceSearchNote, placeMatchLabel } from './search.js';
import { makeMapExperience, initBrandFilm } from './map-experience.js';
import { mountRideCheck } from './ride-check.js';
import { mixedPlaceResults, exactSchool } from './place-search.js';
import { parseArea, rowsInArea } from './area-search.js';
import { savedButton, installSavedPlaces } from './saved-places.js';
import { mergeHomeRows } from './home-rows.js';
import { countyMedia } from './county.js';
import { attachListingTour, hasListingTour } from './listing-tour.js';
import { loadJSON, resultPage, resultsParams } from './data-loader.js';
const byId = id => document.getElementById(id);
const query = byId("query"), suggestions = byId("suggestions"), directory = byId("directory"), cards = byId("cards");
const usd = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
const number = new Intl.NumberFormat("en-US",{maximumFractionDigits:2});
const dates = new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"});
const initialTitle = document.title;
const initialQueryPlaceholder=query.placeholder;
const batchSize = 12;
let activePlan=parseSearch("");
let suggestionTimer;
let startupController;
let routeCleanups=[];
const optionalFailures=new Map();
const optionalFiles={supplement:["data/gallery-homes.json","Additional photo-tour homes"],media:["data/media.json","Listing images"],places:["data/search-places.json","School and neighborhood search"],aliases:["data/property-aliases.json","Older property links"],coverage:["data/coverage.json","Source coverage"]};
const detailShards = new Map();
let proposedArea = '';
const model = { rows:[], indexed:new Map(), county:new Map(), aliases:{}, media:{}, matches:[], suggestions:[], selected:-1, count:batchSize, mediaFilter:"", generation:0, signal:null, ready:false, supplement:{homes:[]}, supplementalCount:0, indexFailed:false, places:{}, coverage:null };
const esc = value => String(value ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const safeURL = value => {
  if (!value || typeof value !== "string") return "";
  try {const url=new URL(value,document.baseURI);return (url.protocol==="https:" || (url.protocol===location.protocol && url.origin===location.origin))?url.href:"";}catch{return "";}
};
const external = (url,label,cls="") => safeURL(url) ? '<a class="'+esc(cls)+'" target="_blank" rel="noopener" href="'+esc(safeURL(url))+'">'+esc(label)+'</a>' : esc(label);
const money = value => value!==null && value!==undefined && value!=="" && Number.isFinite(Number(value)) && Number(value)>0 ? usd.format(Number(value)) : "Unavailable";
const num = value => value===null || value===undefined || value==="" || !Number.isFinite(Number(value)) ? "—" : number.format(Number(value));
const date = value => { if (!value) return "";const d=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+"T00:00:00Z":value);return Number.isFinite(d.getTime())?dates.format(d):String(value);};
const loc = row => [row.city,row.state,row.zip].filter(Boolean).join(" ");
const address = row => row.address || "Street address withheld";
const labels = {front:"Front exterior",exterior:"Exterior",drone:"Drone photograph",aerial:"Aerial view",street:"Street imagery",streetview:"Street imagery",street_context:"Nearby street",oblique:"Oblique aerial"};
const portal = value => labels[value] || "Property photograph";
function viewName(m){return m.areaOnly?"Area aerial":m.viewLabel||portal(m.type);}
function validCrop(media){
  const crop=media.crop;
  return crop && Number.isFinite(crop.x) && Number.isFinite(crop.y) && Number.isFinite(crop.scale)
    && crop.x>=0 && crop.x<=1 && crop.y>=0 && crop.y<=1 && crop.scale>=1 ? crop : null;
}
function cropAttributes(media){
  const crop=validCrop(media);
  if(!crop)return "";
  return ' class="cropped-aerial" style="position:absolute;left:50%;top:50%;width:'+(crop.scale*100)+'%;height:auto;max-width:none;transform:translate('+(-crop.x*100)+'%,'+(-crop.y*100)+'%)"';
}
function mediaFor(row,detail){
  const items=[...(detail?.media||[]),...(model.media[row.id]||[])];
  if(row.county && !items.some(item=>item.type==="aerial"))items.push(...countyMedia(row));
  return items.filter((m,i)=>safeURL(m.url)&&items.findIndex(x=>x.url===m.url)===i);
}
const priority = m => ({front:0,exterior:1,drone:2,aerial:3,street:4,streetview:4,street_context:4}[m.type]??5);
const mediaOrdered = (row,detail) => mediaFor(row,detail).sort((a,b)=>priority(a)-priority(b));
function matching(text,committed=false){
  return findProperties(model.rows,model.media,text,committed);
}
function publicHref(params) {
  const shown=publicMapParams(params).toString();
  return shown?"?"+shown:"./";
}
function localPropertyLink(id){
  const params=currentMapParams();params.set("property",id);return publicHref(params);
}
function routeURL(params,replace=false){
  params=withLanguage(params);
  if(!params.has("layer")&&currentMapParams().get("layer")==="aerial")params.set("layer","aerial");
  writeMapLocation(params,{replace});
  return renderRoute();
}
function lookupURL(text,county=false,keepView=false){
  const p=new URLSearchParams();const school=currentMapParams().get("school");if(school)p.set("school",school);if(text.trim())p.set("q",text.trim());else p.set("browse","all");
  if(keepView){
    const area=currentMapParams().get('area');
    if(parseArea(area)){p.set('area',area);p.set('layout','map');}
  }
  if(keepView && model.mediaFilter)p.set("view",model.mediaFilter);
  const sort=currentMapParams().get("sort");if(sort)p.set("sort",sort);
  if(county)p.set("county","1");return routeURL(p);
}
const getJSON=loadJSON;
async function localDetail(row,signal){
  if(!row.detailShard)return getJSON(row.detailUrl,{signal});
  let shard=detailShards.get(row.detailUrl);
  if(!shard){
    shard=await getJSON(row.detailUrl,{signal});
    if(!shard || typeof shard!=="object" || Array.isArray(shard))throw new Error("Property records could not be read.");
    detailShards.set(row.detailUrl,shard);
    if(detailShards.size>8)detailShards.delete(detailShards.keys().next().value);
  }
  const detail=Object.hasOwn(shard,row.id)?shard[row.id]:null;
  if(!detail || typeof detail!=="object" || Array.isArray(detail) || detail.id && detail.id!==row.id)throw new Error("This property record is unavailable.");
  return detail;
}
function clearSuggestions(){clearTimeout(suggestionTimer);suggestionTimer=null;suggestions.hidden=true;suggestions.replaceChildren();model.suggestions=[];model.selected=-1;query.setAttribute("aria-expanded","false");query.removeAttribute("aria-activedescendant");}
function selectSuggestion(i){model.selected=i;Array.from(suggestions.children).forEach((el,j)=>el.setAttribute("aria-selected",String(j===i)));if(i>=0)query.setAttribute("aria-activedescendant","suggest-"+i);else query.removeAttribute("aria-activedescendant");}
function showSuggestions(){
  clearSuggestions();if(query.value.trim().length<2)return;
  const text=query.value.trim(), plan=parseSearch(text), p=currentMapParams();
  const homes=rowsInArea(model.ready?matching(plan):[],parseArea(p.get('area')));
  const schools=mobility.schoolMatches(text);
  model.suggestions=mixedPlaceResults(text,homes,schools,mobility.current());
  const spanish=currentLanguage()==='es';
  for(const [i,entry] of model.suggestions.entries()){
    const {row,kind}=entry,school=kind==='school';
    const li=document.createElement("li");li.id="suggest-"+i;li.dataset.kind=kind;li.setAttribute("role","option");li.setAttribute("aria-selected","false");
    const a=document.createElement("span");a.textContent=school?row.name:address(row);
    const t=document.createElement("small");
    const type=school?(spanish?'Escuela':'School'):(spanish?'Vivienda':'Home');
    t.textContent=[type,row.zip,school?row.city:placeMatchLabel(row,plan)].filter(Boolean).join(" · ");
    li.append(a,t);li.addEventListener("pointerdown",e=>e.preventDefault());
    li.addEventListener("click",()=>selectPlace(entry));suggestions.append(li);
  }
  suggestions.hidden=!model.suggestions.length;query.setAttribute("aria-expanded",String(!suggestions.hidden));
}
function selectPlace({kind,row}){
  clearSuggestions();
  return kind==='school'?mobility.schoolPin(row):openProperty(row.id,true);
}
function chooseMapHome(id,keepFilter=false) {
  clearSuggestions();
  const params=keepFilter?resultsParams(currentMapParams(),{page:1}):new URLSearchParams();
  const here=currentMapParams();
  const school=here.get("school");if(school)params.set("school",school);
  if(parseArea(here.get("area"))){params.set("area",here.get("area"));params.set("layout","map");}
  params.delete("mode");
  params.set("map",id);
  return routeURL(params);
}
function openProperty(id,fromSearch=false){
  if(fromSearch) return chooseMapHome(id);
  const params=currentMapParams();
  params.set("property",id);clearSuggestions();return routeURL(params);
}
function queueSuggestions(event){
  updateSearchControls();
  clearSuggestions();
  if(!query.disabled && !event.isComposing && query.value.trim().length>=2){
    suggestionTimer=setTimeout(showSuggestions,110);
    if(!mobility.schoolsReady()){
      const requested=query.value;
      mobility.warmSchools().then(()=>{
        if(!suggestionTimer && requested===query.value && document.activeElement===query && mobility.schoolsReady())showSuggestions();
      });
    }
  }
}
query.addEventListener("input",queueSuggestions);
query.addEventListener("compositionend",queueSuggestions);
query.addEventListener("keydown",e=>{
  if(suggestionTimer && (e.key==="ArrowDown"||e.key==="ArrowUp"))showSuggestions();
  const n=model.suggestions.length;
  if(e.key==="Escape"){clearSuggestions();return;}
  if(n && (e.key==="ArrowDown"||e.key==="ArrowUp")){e.preventDefault();selectSuggestion((model.selected+(e.key==="ArrowDown"?1:-1)+n)%n);}
  if(n && e.key==="Enter" && model.selected>=0){e.preventDefault();const row=model.suggestions[model.selected];selectPlace(row);}
});
query.addEventListener("blur",()=>setTimeout(()=>{if(!byId("search").contains(document.activeElement))clearSuggestions();},90));
byId("search").addEventListener("submit",e=>{
  e.preventDefault();if(query.disabled)return;
  const text=query.value.trim(), normalized=normalize(text), p=currentMapParams();
  clearSuggestions();
  const found=rowsInArea(model.ready?matching(text,true):[],parseArea(p.get('area')));
  const exact=found.filter(row=>exactStreet(row,text)||normalized===row._mlsKey||normalized===row._idKey);
  if(exact.length===1&&text){openProperty(exact[0].id,true);return;}
  const schools=mobility.schoolMatches(text),campus=exactSchool(schools,text);
  if(campus){mobility.schoolPin(campus);return;}
  if(mobility.current()==="schools" || text && schools.length && !found.length && !wantsCounty(text)){
    mobility.schoolSearch(text);return;
  }
  lookupURL(text,found.length===0&&wantsCounty(text),true);
});
window.addEventListener("popstate",()=>{protectIncomingMapLocation();setupLanguage();renderRoute();});
byId("browse-all").addEventListener("click",e=>{if(e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();if(query.disabled)return;lookupURL("");});
function updateSearchControls(){
  const clear=byId("clear-search");if(clear){clear.hidden=!query.value;clear.disabled=mobility.current()==="schools"?query.disabled:!model.ready;}
}
byId("clear-search")?.addEventListener("click",()=>{
  if(mobility.current()==="schools"){mobility.schoolSearch("");query.focus();return;}
  if(!model.ready)return;query.value="";clearSuggestions();updateSearchControls();routeURL(new URLSearchParams()).then(()=>query.focus());
});
byId("sort-order")?.addEventListener("change",e=>routeURL(resultsParams(currentMapParams(),{sort:e.target.value,page:1})));
// Keep example queries, home links and result links in the loaded app.
document.addEventListener("click",e=>{
  if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
  const anchor=e.target.closest("a[href]");if(!anchor||anchor.target||anchor.hasAttribute("download"))return;
  const url=new URL(anchor.href,document.baseURI);
  if(url.origin!==location.origin||url.pathname!==location.pathname||url.hash&&url.hash!=="#coverage-details")return;
  e.preventDefault();
  const navigation=routeURL(intentForMapLink(anchor,url.search)),generation=model.generation;
  if(url.hash==="#coverage-details")navigation.then(()=>{
    if(generation!==model.generation)return;
    history.replaceState(history.state,"",location.pathname+location.search+url.hash);openCoverage();
  });
});
function header(title,kicker,status,showBrowse){
  byId("directory-title").textContent=title;byId("collection-kicker").textContent=kicker;byId("directory-status").textContent=status;
  byId("browse-all").hidden=!showBrowse;
}
function cardHTML(row){
  const image=mediaOrdered(row).find(m=>!m.publisher), data=[];
  if(row.beds!=null)data.push(num(row.beds)+" beds");if(row.baths!=null)data.push(num(row.baths)+" baths");if(row.sqft)data.push(num(row.sqft)+" sq ft");
  if(!row.county && (activePlan.event || activePlan.limits.some(limit=>limit.key==="price")) && row.price>0){
    data.push(money(row.price)+" "+(/ask/i.test(row.priceLabel)?"ask":"sale")+" · "+date(row.date));
  }
  const img=image?'<img'+cropAttributes(image)+' alt="'+esc(image.alt || portal(image.type)+" of "+address(row))+'" src="'+esc(safeURL(image.url))+'" loading="lazy" decoding="async">':"";
  const imageLabel=image?viewName(image):"Property record";
  const credit=image?.license?.startsWith("CC BY")?'<span class="card-credit">'+esc(image.credit+" · "+image.license)+'</span>':"";
  const availability=[];
  if (hasListingTour(row.id)) {
    availability.push("Listing photo tour");
  } else if (hasMediaView(row, "gallery")) {
    const count = mediaFor(row).filter(item => !item.publisher).length;
    availability.push(count + " in-app photos");
  }
  const matchedPlace=placeMatchLabel(row,activePlan);
  if(matchedPlace)availability.push(matchedPlace);
  if(model.mediaFilter==="exterior"){
    const first=(model.media[row.id]||[]).find(isExterior);
    if(first)availability.push(viewName(first)+(first.publisher?" in video tour":" photograph"));
  }
  if(Number(row.dronePhotoCount)>0)availability.push(num(row.dronePhotoCount)+" drone photos");
  const extras=availability.length?'<div class="card-availability">'+esc(availability.join(" · "))+'</div>':"";
  return '<article class="card"><a class="card-link" data-property="'+esc(row.id)+'" href="'+esc(localPropertyLink(row.id))+'"><div class="card-image'+(image?'':' missing')+'">'+img+'<span class="image-label">'+esc(imageLabel)+'</span>'+credit+'</div><div class="card-info"><div class="card-location">'+esc(loc(row))+'</div><div class="card-heading"><h3>'+esc(address(row))+'</h3><span class="card-disclosure">View property</span></div><div class="card-meta">'+esc(data.join(" · ") || (row.county?"County property record":row.priceLabel||"Property record"))+'</div>'+extras+'</div></a></article>';
}
cards.addEventListener("click",e=>{const card=e.target.closest("a[data-property]");if(!card||e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();openProperty(card.dataset.property);});

function watchImage(img,frame,{onReady=()=>{},onPending=()=>{},label="Loading image…",retryHost,routeManaged=true}={}){
  const generation=model.generation, source=img.getAttribute("src"), host=retryHost||frame.closest(".card")||frame;
  let timer,observer,disposed=false,failed=false,attempt=0,removeEvents=()=>{};
  let status=document.createElement("div");status.className="image-retry";status.setAttribute("role","status");host.append(status);
  function current(){return !disposed&&generation===model.generation&&img.isConnected;}
  function cleanAttempt(){clearTimeout(timer);removeEvents();observer?.disconnect();}
  function ready(){
    if(!current()||failed||!img.naturalWidth)return;
    cleanAttempt();frame.setAttribute("aria-busy","false");img.hidden=false;status.hidden=true;
    frame.querySelector(".image-loading")?.remove();onReady();
  }
  function unavailable(){
    if(!current())return;
    failed=true;cleanAttempt();frame.setAttribute("aria-busy","false");img.hidden=true;img.removeAttribute("src");
    frame.querySelector(".image-loading")?.remove();status.hidden=false;status.textContent="Image unavailable. ";
    const retry=document.createElement("button");retry.type="button";retry.className="pill";retry.textContent="Retry image";
    retry.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();begin(true);});status.append(retry);
  }
  function begin(retry=false){
    if(!current())return;
    cleanAttempt();failed=false;attempt++;const token=attempt;img.hidden=false;status.hidden=false;status.textContent=label;frame.setAttribute("aria-busy","true");onPending();
    const loaded=()=>{if(token===attempt)ready();},error=()=>{if(token===attempt)unavailable();};
    img.addEventListener("load",loaded);img.addEventListener("error",error);
    removeEvents=()=>{img.removeEventListener("load",loaded);img.removeEventListener("error",error);};
    timer=setTimeout(unavailable,15000);
    if(retry){const url=new URL(source,document.baseURI);url.searchParams.set("retry",Date.now());img.src=url.href;}
    if(img.complete&&img.naturalWidth)ready();else if(img.complete&&!img.naturalWidth)queueMicrotask(()=>{if(current()&&token===attempt&&img.complete&&!img.naturalWidth)unavailable();});
  }
  if(img.loading==="lazy"&&typeof IntersectionObserver==="function"&&!img.complete){
    status.hidden=true;observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))begin();},{rootMargin:"200px"});observer.observe(img);
  }else begin();
  const dispose=()=>{disposed=true;cleanAttempt();status.remove();};if(routeManaged)routeCleanups.push(dispose);return dispose;
}
function selectFeatured(){
  const chosen=[];
  const take=row=>{if(row&&!row.withheld&&!chosen.includes(row)&&mediaFor(row).length)chosen.push(row);};
  for(const id of ["county-0141290000480","zillow-44162974","zillow-43852378","zillow-44226265","zillow-44279045","zillow-44205211","zillow-44298025","zillow-43865354","zillow-44206273","zillow-43855601","zillow-44158652"]){
    if(chosen.length>=3)break;
    take(model.indexed.get(id));
  }
  for(const row of model.rows){if(chosen.length>=3)break;take(row);}
  for(const row of model.rows){if(chosen.length>=3)break;if(!row.withheld&&!chosen.includes(row))chosen.push(row);}
  return chosen;
}
const filters=byId("view-filters");
const viewLabels={"":"All properties",gallery:"Photo galleries",exterior:"Front & exterior",drone:"Drone galleries"};
function isExterior(media){return media.type==="front"||media.type==="exterior";}
function hasMediaView(row,view){
  if(view==="gallery")return hasPhotoGallery(row,model.media);
  if(view==="drone")return Number(row.dronePhotoCount)>0;
  if(view==="exterior")return (model.media[row.id]||[]).some(isExterior);
  return true;
}
function viewParams(view){
  const params=resultsParams(currentMapParams(),{page:1});
  if(!params.has("q"))params.set("browse","all");
  if(view)params.set("view",view);else params.delete("view");
  return params;
}
function showFilterOptions(rows){
  filters.hidden=false;
  filters.innerHTML=Object.entries(viewLabels).map(([key,title])=>{
    const count=key?rows.filter(row=>hasMediaView(row,key)).length:rows.length;
    const selected=key===model.mediaFilter?' aria-current="true"':"";
    return '<a href="'+esc(publicHref(viewParams(key)))+'" data-view="'+key+'"'+selected+'>'+esc(title)+' <span>'+num(count)+'</span></a>';
  }).join("");
}
function onViewClick(e){
  const link=e.target.closest("a[data-view]");
  if(!link||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey)return;
  e.preventDefault();routeURL(viewParams(link.dataset.view));
}
filters.addEventListener("click",onViewClick);
byId("results-actions").addEventListener("click",onViewClick);
function showResults(rows,shownText){
  const list=model.mediaFilter?rows.filter(row=>hasMediaView(row,model.mediaFilter)):rows;
  const params=currentMapParams();
  const paged=resultPage(list,{sort:params.get("sort")||"relevance",page:params.get("page")||1,size:batchSize});
  if(params.has("page")&&params.get("page")!==String(paged.page)){
    const clean=resultsParams(params,{page:paged.page});
    replaceMapLocation(clean);
  }
  if(byId("sort-order"))byId("sort-order").value=paged.sort;
  if(byId("results-toolbar"))byId("results-toolbar").hidden=!shownText||!list.length;
  cards.innerHTML=paged.rows.map(cardHTML).join("");
  for(const img of cards.querySelectorAll("img"))watchImage(img,img.closest(".card-image"));
  const actions=byId("results-actions");actions.replaceChildren();
  if(!list.length && rows.length){
    cards.innerHTML='<div class="no-results"><h3>No matches with this imagery</h3><p>View all '+num(rows.length)+(rows.length===1?" property":" properties")+' in this search.</p></div>';
    actions.innerHTML='<a class="pill" href="'+esc(publicHref(viewParams("")))+'" data-view="">Clear imagery filter</a>';
  }
  if(paged.pages>1){
    const nav=document.createElement("nav");nav.className="pagination";nav.setAttribute("aria-label","Property result pages");
    for(const [label,next,disabled] of [["Previous",paged.page-1,paged.page===1],["Next",paged.page+1,paged.page===paged.pages]]){
      if(label==="Next"){const info=document.createElement("span");info.textContent="Page "+num(paged.page)+" of "+num(paged.pages);nav.append(info);}
      const button=document.createElement("button");button.type="button";button.className="pill";button.textContent=label;button.disabled=disabled;
      button.addEventListener("click",()=>routeURL(resultsParams(currentMapParams(),{page:next})));nav.append(button);
    }
    actions.append(nav);
  }
  const term=query.value.trim();
  if(wantsCounty(term)&&!params.has("area")&&!params.has("county")&&!rows.some(row=>exactStreet(row,term))){
    const button=document.createElement("button");button.type="button";button.className="pill";button.textContent="Check this address in county records";button.addEventListener("click",()=>lookupURL(term,true,true));actions.append(button);
  }
  if(shownText){
    const status=model.mediaFilter?num(list.length)+(list.length===1?" property":" properties")+" with "+viewLabels[model.mediaFilter].toLowerCase()+(query.value?' matching “'+query.value+'”':""):shownText;
    const note=priceSearchNote(activePlan);
    byId("directory-status").textContent=status+(note?" · "+note:"")+(list.length>batchSize?" · Showing "+num(paged.start+1)+"–"+num(paged.start+paged.rows.length):"");
  }
}
function goToArea(area){const generation=model.generation;requestAnimationFrame(()=>{if(generation!==model.generation||!area.isConnected||area.hidden)return;area.focus({preventScroll:true});area.scrollIntoView({behavior:"instant",block:"start"});});}
function focusResults(){goToArea(directory);}
function noResults(text,state){
  if(byId("results-toolbar"))byId("results-toolbar").hidden=true;
  const actions=byId("results-actions");actions.replaceChildren();
  const county=wantsCounty(text);
  const message=state==="pending"?"Checking the county’s public parcel records…":state==="error"?"The county record service did not respond. You can retry or search the county site directly.":state==="empty"?"The county search returned no matching parcel. Try the house number, street and direction without a unit number.":(county?"Try the house number and street, or add the ZIP code.":"Try fewer keywords, a nearby ZIP code, or a wider price range.");
  cards.innerHTML='<div class="no-results"><h3>'+esc(state==="pending"?"Checking county records":county?"No address match":"No matching properties")+'</h3><p>'+esc(message)+'</p></div>';
  if(county && state!=="pending" && state!=="empty"){const b=document.createElement("button");b.className="pill primary";b.textContent=state==="error"?"Retry county search":"Search county records";b.addEventListener("click",()=>lookupURL(text,true));actions.append(b);}
  if(state==="error"||state==="empty"){actions.insertAdjacentHTML("beforeend",external("https://www.miamidadepa.gov/pa/real-estate/property-search.page","County property search","pill"));}
  if(model.mediaFilter && state!=="pending"){actions.insertAdjacentHTML("beforeend",'<a class="pill" href="'+esc(publicHref(viewParams("")))+'" data-view="">Clear imagery filter</a>');}
}
async function countyMatches(text,sig){
  const {searchCounty}=await import("./county.js");const result=await searchCounty(countyAddress(text),{signal:sig});
  for(const row of result){if(!row.county)row.county=true;model.county.set(row.id,row);}return result;
}
async function resolveHome(id,signal){
  const known=model.indexed.get(id)||model.county.get(id);
  if(known||!/^county-\d{13}$/.test(id||''))return known||null;
  const {getCountyDetail}=await import('./county.js');
  const detail=await getCountyDetail(id,{signal});
  if(!detail || signal?.aborted)return null;
  const row=detail.row||detail.property||detail;
  if(row.id!==id||row.withheld)return null;
  model.county.set(id,row);return row;
}
function photoCredit(m){
  return [m.credit?(m.sourceUrl?external(m.sourceUrl,m.credit):esc(m.credit)):m.sourceUrl?external(m.sourceUrl,"Image source"):"",m.license?(m.licenseUrl?external(m.licenseUrl,m.license):esc(m.license)):"",m.date?esc(date(m.date)):"",m.changes?esc(m.changes):""].filter(Boolean).join(" · ");
}
const property=byId("property"),light=byId("lightbox");
byId("close-light").addEventListener("click",()=>light.close());light.addEventListener("click",e=>{if(e.target===light)light.close();});
function photoStepper(count) {
  if (count < 2) return "";
  return '<div class="photo-stepper" role="group" aria-label="Browse photos">' +
    '<button type="button" data-step="-1" aria-label="Previous photo">Previous</button>' +
    '<button type="button" data-step="1" aria-label="Next photo">Next</button></div>';
}

function bindPhotoSwipes(element, step, signal) {
  let origin;
  element.addEventListener("touchstart", event => {
    origin = event.touches.length === 1 ? event.touches[0] : null;
  }, {passive:true, signal});
  element.addEventListener("touchcancel", () => { origin = null; }, {signal});
  element.addEventListener("touchend", event => {
    if (!origin || !event.changedTouches.length) return;
    const end = event.changedTouches[0];
    const dx = end.clientX - origin.clientX;
    const dy = end.clientY - origin.clientY;
    origin = null;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (event.cancelable) event.preventDefault();
    step(dx < 0 ? 1 : -1);
  }, {passive:false, signal});
}

function publisherTourHTML(tour, index) {
  const player = safeURL(tour.embeddedPlayer);
  const supported = /^https:\/\/(?:www\.youtube\.com\/embed\/[\w-]+|player\.vimeo\.com\/video\/\d+)(?:[?#].*)?$/.test(player);
  const label = tour.title || "Video tour";
  if (!supported) return external(tour.sourceUrl, label, "source-link");
  return '<details class="publisher-tour" data-tour="' + index + '">' +
    '<summary><span>Video tour</span><strong>' + esc(label) + '</strong></summary>' +
    '<div class="tour-player"></div><p class="media-credit">' + photoCredit(tour) + '</p></details>';
}

function drawGallery(row, detail) {
  const panel = byId("media-panel");
  if (!panel) return;
  const media = mediaOrdered(row, detail);
  const photos = media.filter(item => !item.publisher);
  const tours = media.filter(item => item.publisher);
  const street = (detail.links || []).find(link => /street view/i.test(link.label) && safeURL(link.url));
  const drone = detail.droneGallery;
  function galleryLinks() {
    let links = street ? external(street.url, "Nearby Street View", "source-link street-action") : "";
    if (drone?.count > 0 && safeURL(drone.url)) {
      links += '<div class="drone-gallery">' +
        external(drone.url, "Open " + drone.count + " drone photos", "source-link drone-action") +
        '<small>' + esc([drone.credit, date(drone.date)].filter(Boolean).join(" · ")) + '</small></div>';
    }
    return links ? '<div class="gallery-links">' + links + '</div>' : "";
  }

  const emptyMessage = row.withheld
    ? "The listing withholds this home’s street address and exact location."
    : "An address-verified photo is unavailable for this record.";
  const rail = photos.length > 1 ? '<div class="photo-rail" aria-label="Choose a photo"></div>' : "";
  const gallery = '<section class="photo-gallery" aria-label="Property photos">' +
    '<button type="button" class="viewer" id="enlarge"><span class="expand" aria-hidden="true"><i class="expand-icon"></i></span></button>' +
    '<div class="photo-status"></div><div class="photo-toolbar"><div class="photo-caption" aria-live="polite" aria-atomic="true"></div>' +
    photoStepper(photos.length) + '</div>' + rail +
    '<p class="media-credit"></p><p class="image-availability"></p></section>';
  panel.innerHTML = (photos.length ? gallery : '<div class="media-empty"><p>' + esc(emptyMessage) + '</p></div>') +
    tours.map(publisherTourHTML).join("") + galleryLinks();
  attachListingTour(panel, row, detail);

  const controller = new AbortController();
  const {signal} = controller;
  routeCleanups.push(() => controller.abort());
  for (const tourDetails of panel.querySelectorAll(".publisher-tour")) {
    tourDetails.addEventListener("toggle", () => {
      const host = tourDetails.querySelector(".tour-player");
      if (!tourDetails.open) {
        host.replaceChildren();
        return;
      }
      if (host.firstChild) return;
      const tour = tours[Number(tourDetails.dataset.tour)];
      const player = document.createElement("iframe");
      player.title = tour.title || "Property video tour";
      player.allowFullscreen = true;
      player.referrerPolicy = "strict-origin-when-cross-origin";
      player.src = safeURL(tour.embeddedPlayer);
      host.append(player);
    }, {signal});
  }
  if (!photos.length) return;

  const section = panel.querySelector(".photo-gallery");
  const viewer = section.querySelector(".viewer");
  const strip = section.querySelector(".photo-rail");
  const lightStage = byId("light-stage");
  const lightNav = byId("light-nav");
  lightNav.innerHTML = photoStepper(photos.length);
  let active = 0;
  let stopInline = () => {};
  let stopExpanded = () => {};
  routeCleanups.push(() => {
    stopInline();
    stopExpanded();
  });

  if (strip) {
    strip.innerHTML = photos.map((item, index) =>
      '<button type="button" class="photo-thumb" data-photo="' + index + '" aria-label="Photo ' +
        (index + 1) + ' of ' + photos.length + ', ' + esc(item.title || viewName(item)) + '">' +
        '<img loading="lazy" decoding="async" alt="" src="' + esc(safeURL(item.url)) + '"' + cropAttributes(item) + '>' +
        '<span aria-hidden="true">' + (index + 1) + '</span></button>'
    ).join("");
  }

  function showPhoto(frame, status, expanded) {
    const item = photos[active];
    const previous = frame.querySelector("img");
    const image = document.createElement("img");
    const crop = validCrop(item);
    image.id = expanded ? "lightimg" : "property-photo";
    image.alt = item.alt || viewName(item) + " for " + address(row);
    if (crop) {
      image.className = "cropped-aerial";
      image.style.width = (crop.scale * 100) + "%";
      image.style.transform = 'translate(' + (-crop.x * 100) + '%, ' + (-crop.y * 100) + '%)';
    }
    frame.classList.toggle("has-crop", Boolean(crop));
    if (previous) previous.replaceWith(image);
    else frame.prepend(image);
    image.src = safeURL(item.url);
    return watchImage(image, frame, {retryHost:status, routeManaged:false});
  }

  function captionHTML() {
    const item = photos[active];
    const title = item.title || viewName(item);
    return '<small>Photo ' + (active + 1) + ' of ' + photos.length + '</small><strong>' + esc(title) + '</strong>';
  }

  function renderExpanded() {
    stopExpanded();
    byId("lightlabel").textContent = address(row);
    byId("light-caption").innerHTML = captionHTML();
    byId("lightcredit").innerHTML = photoCredit(photos[active]);
    stopExpanded = showPhoto(lightStage, byId("light-status"), true);
  }

  function select(index) {
    active = (index + photos.length) % photos.length;
    const item = photos[active];
    stopInline();
    stopInline = showPhoto(viewer, section.querySelector(".photo-status"), false);
    viewer.setAttribute("aria-label", "Expand photo " + (active + 1) + " of " + photos.length + ", " + (item.title || viewName(item)));
    section.querySelector(".photo-caption").innerHTML = captionHTML();
    section.querySelector(".media-credit").innerHTML = photoCredit(item);
    const note = section.querySelector(".image-availability");
    if (item.areaOnly) note.textContent = "This aerial shows the surrounding area of a shared listing location.";
    else if (["street", "street_context", "streetview"].includes(item.type)) note.textContent = "Street photography shows the vicinity. A specific façade may be outside the frame.";
    else note.textContent = "";
    note.hidden = !note.textContent;
    if (strip) {
      const current = strip.children[active];
      strip.querySelector("[aria-current]")?.removeAttribute("aria-current");
      current.setAttribute("aria-current", "true");
      const railBounds = strip.getBoundingClientRect();
      const thumbBounds = current.getBoundingClientRect();
      if (thumbBounds.left < railBounds.left) strip.scrollLeft -= railBounds.left - thumbBounds.left;
      if (thumbBounds.right > railBounds.right) strip.scrollLeft += thumbBounds.right - railBounds.right;
    }
    if (light.open) renderExpanded();
  }

  const step = delta => select(active + delta);
  function navigate(event) {
    const button = event.target.closest("button[data-step],button[data-photo]");
    if (!button) return;
    if (button.hasAttribute("data-photo")) select(Number(button.dataset.photo));
    else step(Number(button.dataset.step));
  }
  function keydown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    if (event.key === "Home") select(0);
    else if (event.key === "End") select(photos.length - 1);
    else step(event.key === "ArrowLeft" ? -1 : 1);
    if (event.target.closest(".photo-thumb")) strip.children[active].focus({preventScroll:true});
  }
  if (photos.length > 1) {
    for (const area of [section, light]) {
      area.addEventListener("click", navigate, {signal});
      area.addEventListener("keydown", keydown, {signal});
    }
    bindPhotoSwipes(viewer, step, signal);
    bindPhotoSwipes(lightStage, step, signal);
  }
  viewer.addEventListener("click", () => {
    renderExpanded();
    light.showModal();
  }, {signal});
  light.addEventListener("close", () => {
    if (light.open) return;
    stopExpanded();
    lightStage.replaceChildren();
  }, {signal});
  select(0);
}
function cleanValue(value){return String(value??"").replace(/(\d+\.\d{3})\d{2,}(?=\s*(?:acres?|sq\s*ft))/gi,(_,n)=>Number(n).toString());}
function tableHTML(headers,rows){
  const head='<thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join("")+'</tr></thead>';
  const rowHTML=r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join("")+'</tr>';
  const table=(list,caption)=>'<table aria-label="'+esc(caption)+'">'+head+'<tbody>'+list.map(rowHTML).join("")+'</tbody></table>';
  const count=5;return table(rows.slice(0,count),headers.join(", "))+(rows.length>count?'<details><summary>Show '+(rows.length-count)+' older '+(rows.length-count===1?'record':'records')+'</summary>'+table(rows.slice(count),"Older records")+'</details>':"");
}
function block(title,body,wide=false){return '<section class="detail-block'+(wide?' wide':'')+'"><h2 class="block-title">'+esc(title)+'</h2>'+body+'</section>';}
function propertyHTML(row,detail={}){
  const counts=[["Beds",num(row.beds)],["Baths",num(row.baths)],["Living area",row.sqft?num(row.sqft)+" ft²":"—"],["Built",num(row.year).replace(/,/g,"")],["ZIP",row.zip||"—"],["MLS",row.mls||"—"]];
  const shownPrice=money(row.price), fields=detail.facts||[], obs=detail.observations||[], prices=detail.priceHistory||[], taxes=detail.taxHistory||[], sections=detail.sections||[], links=detail.links||[];
  const locationFacts=[];
  for(const label of ["Neighborhood","Subdivision"]){
    const names=(row._places||[]).filter(place=>place.label===label).map(place=>place.name);
    if(names.length)locationFacts.push({label,value:[...new Set(names)].join(" · ")});
  }
  const listedFacts=[...locationFacts,...fields.filter(item=>!locationFacts.some(place=>place.label.toLowerCase()===item.label.toLowerCase()))];
  const sourceItems=links.filter(l=>safeURL(l.url));
  if(locationFacts.some(fact=>fact.label==="Neighborhood"))sourceItems.push({label:"City of Miami neighborhood boundaries",url:"https://gis.miami.gov/gis/rest/services/Maps/Neighborhoods/MapServer/0"});
  const price=shownPrice!=="Unavailable"?'<div class="price-block"><strong>'+esc(shownPrice)+'</strong><small>'+esc([row.priceLabel,date(row.date)].filter(Boolean).join(" · "))+'</small></div>':"";
  const stats=counts.filter(([k,v])=>v!=="—").map(([k,v])=>'<div><dt>'+esc(k)+'</dt><dd'+(k==="MLS"?' style="font:600 14px var(--sans);overflow-wrap:anywhere;padding-block:4px"':'')+'>'+esc(v)+'</dd></div>').join("");
  const backLabel=currentMapParams().has("map")?"Back to map":currentMapParams().has("q")?"Back to search results":"Back to property index";
  const backParams=resultsParams(currentMapParams());
  const backHref=publicHref(backParams);
  const routeParams=new URLSearchParams({mode:'route',home:row.id});
  const selectedSchool=currentMapParams().get('school');if(selectedSchool)routeParams.set('school',selectedSchool);
  const header='<a href="'+esc(backHref)+'" id="back" class="back">'+esc(backLabel)+'</a><div class="eyebrow section-tag">'+esc(row.county?"Miami–Dade County property record":"Miami property record")+'</div><div class="property-title-row"><div><h1 tabindex="-1">'+esc(address(row))+'</h1><p class="property-location">'+esc(loc(row))+'</p></div>'+price+'</div><p class="record-context">'+esc((row.county?'County record retrieved':'Listing record date')+(row.date?' · '+date(row.date):''))+'</p><div class="property-actions"><button class="pill" type="button" id="copy-address">Copy address</button><a class="pill" id="plan-property-route" href="'+esc(publicHref(routeParams))+'">Plan school route</a><span id="copy-status" class="copy-status" role="status"></span></div>';
  const main='<div class="property-layout"><div id="media-panel" class="media-panel"></div><aside class="summary-panel"><div class="eyebrow section-tag">Property overview</div><h2 class="block-title">At a glance</h2>'+(stats?'<dl class="summary-stats">'+stats+'</dl>':'<p class="single-note">Room and size details were unavailable.</p>')+(sourceItems.length?'<div class="source-group">'+sourceItems.slice(0,2).map(l=>external(l.url,l.label,"source-link")).join("")+'</div>':"")+'</aside></div>';
  const blocks=[];
  if(listedFacts.length)blocks.push(block("Property facts",'<dl class="fact-list">'+listedFacts.map(f=>'<div><dt>'+esc(f.label)+'</dt><dd>'+esc(cleanValue(f.value))+'</dd></div>').join("")+'</dl>'));
  if(obs.length)blocks.push(block("Dated observations",tableHTML(["Date","Observation","Price"],obs.map(o=>[esc(date(o.date)),esc(o.label)+(o.source?"<br><small>"+(o.url?external(o.url,o.source):esc(o.source))+"</small>":""),esc(money(o.price))]))));
  if(prices.length)blocks.push(block("Price history",tableHTML(["Date","Event","Price"],prices.map(r=>[esc(date(r.date)),esc(r.label)+(r.source?"<br><small>"+esc(r.source)+"</small>":""),esc(money(r.price))]))));
  if(taxes.length)blocks.push(block("Tax history",tableHTML(["Year","Assessed value","Property tax"],taxes.map(r=>[esc(r.year),esc(money(r.assessed)),esc(money(r.tax))]))));
  if(sections.length)blocks.push(block("More property details",sections.filter(s=>s.items?.length).map(s=>'<details><summary>'+esc(s.title)+'</summary><ul class="attr-list">'+s.items.map(item=>'<li>'+esc(cleanValue(item))+'</li>').join("")+'</ul></details>').join(""),true));
  const mapLink=!row.withheld&&row.lat!=null&&row.lng!=null&&Number.isFinite(Number(row.lat))&&Number.isFinite(Number(row.lng))?'https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(row.lat+","+row.lng):"";
  if(sourceItems.length||mapLink){blocks.push(block("Sources and location",'<div class="source-group">'+sourceItems.map(l=>external(l.url,l.label,"source-link")).join("")+(mapLink?external(mapLink,"Map location","source-link"):"")+'</div>',true));}
  property.innerHTML=header+main+'<details class="map-ride property-ride"><summary>Check my school ride</summary><div id="full-ride"></div></details><div class="history-grid">'+blocks.join("")+'</div>';
  setMapHref(byId('plan-property-route'),routeParams);
  addHomeTools(property,row,true);
  const ridePanel=property.querySelector(".property-ride");
  ridePanel.addEventListener("toggle",()=>{if(ridePanel.open && !ridePanel.dataset.mounted){ridePanel.dataset.mounted="true";routeCleanups.push(mountRideCheck(byId("full-ride"),row,rideOptions(row)));}});
  drawGallery(row,detail);
  const copy=byId("copy-address");
  copy?.addEventListener("click",async()=>{
    const generation=model.generation,status=byId("copy-status");copy.disabled=true;
    try{
      if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText([address(row),loc(row)].filter(Boolean).join(", "));
      if(generation===model.generation&&status.isConnected)status.textContent="Address copied.";
    }catch{
      if(generation===model.generation&&status.isConnected)status.textContent="Couldn’t copy. Select the address above to copy it.";
    }finally{if(copy.isConnected)copy.disabled=false;}
  });
  byId("back").addEventListener("click",e=>{if(e.metaKey||e.ctrlKey||e.shiftKey)return;e.preventDefault();const params=currentMapParams();params.delete("property");routeURL(params);});
}
function readingError(id,message){property.innerHTML='<a class="back" href="./">Property search</a><h1>Record unavailable</h1><p class="single-note">'+esc(message)+'</p><div class="results-actions"><button class="pill" type="button" id="retry-record">Try again</button></div>';byId("retry-record").addEventListener("click",renderRoute);}
async function renderRoute(){
  const intent=currentMapParams();
  proposedArea='';updateAreaControls(intent);
  mobility.headers(intent);
  if(mobility.current()!=="homes"){
    for(const cleanup of routeCleanups)cleanup();routeCleanups=[];
    model.generation++;model.signal?.abort();if(light.open)light.close();clearSuggestions();
    return mobility.render(intent);
  }
  mobility.leave();
  if(!model.ready){if(model.indexFailed){query.disabled=true;query.placeholder="Property index unavailable";const info=byId("index-progress");info.hidden=false;info.textContent="Property index unavailable. Retry below.";byId("search").querySelector('[type=submit]').disabled=true;}byId("trip-panel").hidden=true;byId("map-card").hidden=false;byId("home").hidden=false;byId("property").hidden=true;return;}
  query.disabled=false;byId("search").querySelector('[type=submit]').disabled=false;byId("index-progress").hidden=true;
  for(const cleanup of routeCleanups)cleanup();routeCleanups=[];
  const gen=++model.generation;model.signal?.abort();model.signal=new AbortController();const signal=model.signal.signal;
  const p=currentMapParams(), requestedId=p.get("property"), term=p.get("q")||"", area=parseArea(p.get("area")), browse=p.has("browse")||p.has("view")||Boolean(area);
  const id=requestedId && Object.hasOwn(model.aliases,requestedId)?model.aliases[requestedId]:requestedId;
  const requestedView=p.get("view");
  model.count=batchSize;model.mediaFilter=Object.hasOwn(viewLabels,requestedView)?requestedView:"";clearSuggestions();query.value=term;updateSearchControls();filters.hidden=true;
  if(byId("results-toolbar"))byId("results-toolbar").hidden=true;
  if(light.open)light.close();
  byId("home").hidden=Boolean(id);property.hidden=!id;document.title=initialTitle;
  if(id){
    explorer.suspend();
    let row=model.indexed.get(id)||model.county.get(id);
    property.innerHTML='<p class="loading-state" role="status">Opening property record…</p>';window.scrollTo({top:0,behavior:"instant"});
    try{
      let detail;
      if(row?.detailUrl){
        detail=await localDetail(row,signal);
      }else if(id.startsWith("county-")){
        const {getCountyDetail}=await import("./county.js");
        detail=await getCountyDetail(id,{signal});if(!detail)throw new Error("The county could not match this parcel.");
        row=row||detail.row||detail.property||detail;row.county=true;
      }else{throw new Error("This link does not match a property in the Miami index.");}
      if(gen!==model.generation)return;
      propertyHTML(row,detail);document.title=address(row)+" — Buggy";property.querySelector("h1")?.focus({preventScroll:true});
    }catch(e){
      if(gen!==model.generation||signal.aborted)return;
      if(row){
        propertyHTML(row);
        const message=e.code==="UNSUPPORTED_DECOMPRESSION"||e.code==="DATA_TIMEOUT"?e.message:"Additional property facts could not load. The overview is still available.";
        property.insertAdjacentHTML("beforeend",'<p class="single-note" role="status">'+esc(message)+' <button type="button" class="pill" id="retry-record">Try again</button></p>');
        byId("retry-record").addEventListener("click",renderRoute);
      }else readingError(id,e.message);
    }
    return;
  }
  byId("results-actions").replaceChildren();
  activePlan=parseSearch(term);
  const mapId=p.get("map");
  let mapped=mapId && (model.indexed.get(mapId)||model.county.get(mapId));
  if(mapId && !mapped && /^county-\d{13}$/.test(mapId)){
    try{mapped=await resolveHome(mapId,signal);}catch(error){
      if(gen!==model.generation||signal.aborted)return;
      explorer.show({all:model.rows,rows:[],mode:"results",term:"County address unavailable",key:"county-error:"+mapId});
      const button=document.createElement("button");button.type="button";button.className="map-secondary";
      button.textContent=currentLanguage()==='es'?'Volver a consultar el condado':'Retry county address';button.onclick=renderRoute;byId("map-card").append(button);
      return;
    }
    if(gen!==model.generation||signal.aborted)return;
  }
  if(mapped || !term&&!browse){
    if(mapId && !mapped){
      explorer.show({all:model.rows,rows:[],mode:"results",term:"Unknown map record",key:"invalid:"+mapId});
    } else {
      let visibleRows=rowsInArea(term?matching(activePlan,true):model.rows,area);
      if(model.mediaFilter)visibleRows=visibleRows.filter(home=>hasMediaView(home,model.mediaFilter));
      if(mapped&&!model.indexed.has(mapped.id))visibleRows=[...visibleRows,mapped];
      explorer.show({all:model.rows,rows:visibleRows,row:mapped,mode:mapped?"home":"overview",key:mapped?.id||"overview"});
      if(mapped){document.title=address(mapped)+" · Buggy map";query.value=address(mapped);updateSearchControls();}
    }
    header("Explore Miami homes","Property index · "+model.rows.length.toLocaleString("en-US")+" records","City of Miami homes and Miami-area listing records",true);showResults(selectFeatured(),"");
    if(!location.hash)window.scrollTo({top:0,behavior:"instant"});return;
  }
  let rows=rowsInArea(term?matching(activePlan,true):model.rows,area);model.matches=rows;
  const title=area?"Homes in this map area":term?"Search results":"Browse properties";
  const foundText=n=>n.toLocaleString("en-US")+(n===1?" record":" records")+(term?' matching “'+term+'”':area?" in this map area":" in the Miami index");
  header(title,"Property lookup",foundText(rows.length),Boolean(term));
  function showMapResults(matches) {
    const visible=model.mediaFilter?matches.filter(row=>hasMediaView(row,model.mediaFilter)):matches;
    explorer.show({all:model.rows,rows:visible,mode:"results",term:term||viewLabels[model.mediaFilter],key:"results:"+term+":"+model.mediaFilter+":"+visible.length+":"+(p.get("area")||""),area});
  }
  showMapResults(rows);
  if((browse&&!term||p.has("page")||p.has("sort")||p.has("view"))&&p.get("layout")!=="map")focusResults();
  else window.scrollTo({top:0,behavior:"instant"});
  showFilterOptions(rows);
  if(rows.length && !(p.has("county")&&wantsCounty(term)&&!rows.some(row=>exactStreet(row,term)))){showResults(rows,foundText(rows.length));return;}
  if(area && !rows.length){
    cards.innerHTML='<div class="no-results"><p>'+esc(currentLanguage()==='es'?'No hay viviendas que coincidan en esta zona.':'No matching homes in this map area.')+'</p></div>';
    const clear=document.createElement('button');clear.type='button';clear.className='pill';clear.textContent=currentLanguage()==='es'?'Buscar fuera de la zona':'Search outside this area';
    clear.onclick=()=>searchMapArea('');byId('results-actions').append(clear);return;
  }
  if(!p.has("county")||!wantsCounty(term)){noResults(term,"local");return;}
  noResults(term,"pending");
  try{
    rows=await countyMatches(term,signal);if(gen!==model.generation)return;
    if(!rows.length){noResults(term,"empty");return;}
    model.matches=rows;showMapResults(rows);showFilterOptions(rows);showResults(rows,rows.length+(rows.length===1?" county address match":" county address matches")+' for “'+term+'”');
  }catch{if(gen===model.generation&&!signal.aborted)noResults(term,"error");}
}
function addHomeTools(container,row,full=false) {
  if(row.withheld)return;
  const buttons=container.querySelector(full?'.property-actions':'.map-card-actions');
  buttons?.append(savedButton({kind:'home',home:row},currentLanguage()));
  const nearby=document.createElement('div');
  if(full)container.querySelector('.property-ride')?.before(nearby);
  else container.querySelector('.map-ride')?.before(nearby);
  mobility.nearby(nearby,row);
}
function updateAreaControls(params=currentMapParams()){
  const select=byId('search-area'),reset=byId('reset-area');if(!select||!reset)return;
  const eligible=params.get('mode')!=='route'&&!params.has('property')&&!params.has('campuses');
  select.hidden=!eligible||!proposedArea||proposedArea===params.get('area');
  reset.hidden=!eligible||!parseArea(params.get('area'));
}
function searchMapArea(value) {
  const p=currentMapParams();
  if(value){if(!parseArea(value))return;p.set('area',value);}
  else p.delete('area');
  p.delete('page');p.delete('county');
  if(p.get('mode')==='schools'){p.delete('school');}
  else {p.delete('map');p.delete('property');}
  if(value||p.has('browse')||p.has('view'))p.set('layout','map');
  else p.delete('layout');
  return routeURL(p);
}
byId('search-area')?.addEventListener('click',()=>searchMapArea(explorer.visibleArea()||proposedArea));
byId('reset-area')?.addEventListener('click',()=>searchMapArea(''));
const rideOptions=row=>({schools: model.places[row.id]?.schools || row._schools,lookup: async (...args)=>(await import("./ride-data.js")).lookupRideCoverage(...args)});
const explorer=makeMapExperience({choose:(row,markers)=>{
  if(markers==="schools")mobility.schoolPin(row);
  else if(mobility.current()==="route")mobility.routeHome(row);
  else chooseMapHome(row.id,true);
},onLayerChange:layer=>mobility.layerChange(layer),addHomeTools,
  onExploreArea:bounds=>{proposedArea=bounds;updateAreaControls();},mediaFor:mediaOrdered,cropAttributes,viewName,photoCredit,esc,watchImage,rideOptions});
protectIncomingMapLocation();
setupLanguage();
const sampleTrip=document.querySelector('.journey-trip-card[data-sample-home]');
if(sampleTrip){
  const sample=new URLSearchParams(new URL(sampleTrip.href,document.baseURI).search);
  sample.set('mode','route');sample.set('home',sampleTrip.dataset.sampleHome);
  setMapHref(sampleTrip,sample);
}
const mobility=createExploreModes({explorer,getHomes:text=>text.trim()?matching(text):model.rows,
  resolveHome,getHome:id=>model.indexed.get(id)||model.county.get(id),homesReady:()=>model.ready,homesFailed:()=>model.indexFailed,retryHomes:start,navigate:routeURL,refresh:renderRoute});
installSavedPlaces({button:byId('open-saved'),dialog:byId('saved-places-dialog'),getLanguage:currentLanguage,onNavigate:routeURL});
initBrandFilm();
function yieldToBrowser(){
  return new Promise(resolve=>{
    const channel=new MessageChannel();
    channel.port1.onmessage=()=>{
      channel.port1.close();channel.port2.close();resolve();
    };
    channel.port2.postMessage(null);
  });
}
function openCoverage(){
  const details=byId("coverage-details");if(!details)return;details.open=true;details.scrollIntoView({behavior:"instant",block:"start"});
}
function updateCoverage(){
  if(byId("records-count"))byId("records-count").textContent=num(model.rows.length);
  if(byId("aerial-count"))byId("aerial-count").textContent=model.coverage?num(model.coverage.aerialRecords+model.supplementalCount):"Unavailable";
  if(model.coverage&&byId("coverage-description")){
    const coverage=model.coverage;
    byId("coverage-description").textContent=num(model.rows.length)+" searchable records, including "+num(coverage.countyRecords)+" disclosed single-family properties in the City of Miami. County data retrieved "+new Intl.DateTimeFormat("en-US",{year:"numeric",month:"short",day:"numeric",timeZone:"America/New_York"}).format(new Date(coverage.capturedAt))+". This collection also includes the earlier Miami-area listing archive."+ (model.supplementalCount?" "+num(model.supplementalCount)+" additional Miami-Dade homes have a county-matched listing gallery.":"");
  }
}
function showOptionalNotice(){
  const notice=byId("app-notice");if(!notice)return;
  notice.replaceChildren();notice.hidden=!optionalFailures.size;
  if(!optionalFailures.size)return;
  const message=document.createElement("span");message.textContent="Some information could not load: "+[...optionalFailures.keys()].map(key=>optionalFiles[key][1]).join(", ")+". Address search is available. ";notice.append(message);
  const button=document.createElement("button");button.type="button";button.className="pill";button.textContent="Retry missing data";notice.append(button);
  button.addEventListener("click",async()=>{
    button.disabled=true;button.textContent="Retrying…";
    try{
      await Promise.all([...optionalFailures.keys()].map(key=>loadOptional(key,startupController.signal)));
      if(startupController.signal.aborted)return;
      const expanded=mergeHomeRows(model.rows,model.supplement?.homes||[]);
      model.supplementalCount+=expanded.length-model.rows.length;model.rows=expanded;
      for(let offset=0;offset<model.rows.length;offset+=1000){
        if(startupController.signal.aborted)return;
        for(const row of model.rows.slice(offset,offset+1000))indexRow(row,model.places[row.id]);
        if(offset+1000<model.rows.length)await yieldToBrowser();
      }
      model.indexed=new Map(model.rows.map(row=>[row.id,row]));
      updateCoverage();showOptionalNotice();await renderRoute();
    }catch{showOptionalNotice();}
  });
}
async function loadOptional(key,signal){
  try{model[key]=await getJSON(optionalFiles[key][0],{signal,timeoutMs:10000});optionalFailures.delete(key);}
  catch(error){if(signal.aborted)throw error;optionalFailures.set(key,error);}
}
async function start(){
  startupController?.abort();startupController=new AbortController();const startup=startupController,signal=startup.signal;
  model.ready=false;model.indexFailed=false;
  header("Explore Miami homes","Property lookup","Loading the property index…",false);clearSuggestions();
  query.disabled=true;query.placeholder="Loading properties…";updateSearchControls();
  if(byId("app-notice"))byId("app-notice").hidden=true;
  const progress=byId("index-progress");if(progress){progress.hidden=false;progress.textContent="Loading properties…";}
  const retry=byId("reload-index");if(retry)retry.disabled=true;
  byId("search").querySelector('button[type="submit"]').disabled=true;byId("search").setAttribute("aria-busy","true");
  try{
    const [baseRows]=await Promise.all([getJSON("data/index.json",{signal,timeoutMs:30000}),...Object.keys(optionalFiles).map(key=>loadOptional(key,signal))]);
    const rows=mergeHomeRows(baseRows,model.supplement?.homes||[]);
    model.supplementalCount=rows.length-baseRows.length;
    const indexed=[];
    if(progress && mobility.current()==="homes")progress.textContent="Preparing address search…";
    for(let offset=0;offset<rows.length;offset+=1000){
      if(signal.aborted)return;
      indexed.push(...rows.slice(offset,offset+1000).map(row=>indexRow(row,model.places[row.id])));
      if(offset+1000<rows.length)await yieldToBrowser();
    }
    if(signal.aborted)return;
    model.rows=indexed;model.indexed=new Map(model.rows.map(row=>[row.id,row]));model.ready=true;globalThis.performance?.mark?.("buggy.home.search");
    updateCoverage();showOptionalNotice();
    if(mobility.current()==="homes"){
      query.disabled=false;query.placeholder=initialQueryPlaceholder;updateSearchControls();
      byId("search").querySelector('button[type="submit"]').disabled=false;byId("search").setAttribute("aria-busy","false");
      if(progress){progress.textContent=num(model.rows.length)+" properties ready to search.";progress.hidden=true;}
    }
    if(mobility.current()==="homes"){await renderRoute();}
    else {mobility.homeDataReady();mobility.headers(currentMapParams());}
    if(location.hash==="#coverage-details")openCoverage();
  }catch(error){
    if(signal.aborted)return;
    startup.abort();model.indexFailed=true;
    if(mobility.current()==="homes"){
      query.placeholder="Property index unavailable";byId("search").setAttribute("aria-busy","false");
      if(progress){progress.hidden=false;progress.textContent="Property index unavailable. Retry below.";}
    } else mobility.homeDataReady();
    header("Address index unavailable","Property lookup",error.code==="DATA_TIMEOUT"?error.message:"The property index could not load. Please retry.",false);
    cards.innerHTML='<div class="no-results"><button class="pill primary" id="reload-index">Retry loading the index</button> <a href="../report/">Open the research report</a></div>';
    byId("reload-index").addEventListener("click",start);
  }
}
start();
if(mobility.current()!=="homes")renderRoute();
else mobility.headers(currentMapParams());
if('requestIdleCallback' in window)requestIdleCallback(()=>mobility.warmSchools(),{timeout:2500});
else setTimeout(()=>mobility.warmSchools(),1200);

function watchConnection(){
  const note=byId("offline-notice");
  const update=()=>{note.hidden=navigator.onLine;};
  update();window.addEventListener("online",update);window.addEventListener("offline",update);
  if('serviceWorker' in navigator && location.protocol==='https:'){
    const install=()=>navigator.serviceWorker.register('./atlas-offline.js',{scope:'./'}).catch(()=>{});
    if('requestIdleCallback' in window)window.requestIdleCallback(install,{timeout:6000});else setTimeout(install,3000);
  }
}
watchConnection();
