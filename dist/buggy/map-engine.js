import './map-assets/leaflet.js';
import { encodeArea } from './area-search.js';
import { homeOverview } from './map-assets/home-overview.js';
import { makeAerialLayer } from './map-assets/aerial.js';
import { createStreetLayer } from './map-assets/cartography.js';

const L = globalThis.L;
const HOME = [25.7655, -80.2195];
const coverage = [[25.17, -80.90], [25.99, -80.038]];
const formatter = new Intl.NumberFormat('en-US');
const houseIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3.5 11 8.5-7.1 8.5 7.1M6.5 9.7v10h4v-5h3v5h4v-10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"/></svg>';
const schoolIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 9.3 10-5 10 5-10 5-10-5Zm4 2v5.7c4 3.1 8 3.1 12 0v-5.7M22 9.3v5.6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.9"/></svg>';
const homeViewIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.8"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>';
// Label points are named places. The road, water and park outlines use Census geometry.
const placeLabels = [
  ['Miami',25.775,-80.192,9,13,'city'], ['Miami Beach',25.802,-80.134,9,15,'city'],
  ['Coral Gables',25.744,-80.265,10,14,'town'], ['Hialeah',25.86,-80.291,10,15,'city'],
  ['Doral',25.817,-80.353,10,15,'town'], ['Kendall',25.674,-80.346,10,14,'town'],
  ['South Miami',25.704,-80.291,11,15,'town'], ['Key Biscayne',25.694,-80.162,10,16,'town'],
  ['Pinecrest',25.664,-80.303,11,15,'town'], ['Sweetwater',25.764,-80.371,11,15,'town'],
  ['Miami Shores',25.863,-80.194,11,16,'town'], ['North Miami',25.887,-80.187,10,15,'town'],
  ['Homestead',25.469,-80.478,9,16,'city'], ['Cutler Bay',25.579,-80.34,10,15,'town'],
  ['Little Havana',25.77,-80.226,12,17,'district'], ['Coconut Grove',25.721,-80.244,12,17,'district'],
  ['Brickell',25.7574,-80.1947,13,17,'district'], ['Wynwood',25.803,-80.2,12,17,'district'],
  ['Little Haiti',25.832,-80.193,12,17,'district'], ['Allapattah',25.81,-80.224,12,17,'district'],
  ['Flagami',25.768,-80.296,12,17,'district'], ['Westchester',25.747,-80.335,12,16,'district'],
  ['Coral Way',25.746,-80.228,13,17,'district'], ['Shenandoah',25.755,-80.22,14,17,'district'],
  ['Overtown',25.785,-80.206,13,17,'district'], ['Downtown',25.777,-80.189,14,18,'district'],
  ['Edgewater',25.794,-80.19,14,17,'district'], ['Design District',25.813,-80.193,14,17,'district'],
  ['Liberty City',25.835,-80.225,13,17,'district'], ['Little River',25.847,-80.191,14,17,'district'],
  ['The Roads',25.753,-80.204,14,17,'district'], ['Silver Bluff',25.735,-80.233,14,17,'district'],
  ['South Beach',25.783,-80.136,12,16,'district'], ['Virginia Key',25.735,-80.151,12,16,'district'],
  ['Fisher Island',25.761,-80.142,13,17,'district'], ['Biscayne Bay',25.742,-80.178,10,15,'water'],
  ['Atlantic Ocean',25.777,-80.103,10,15,'water'], ['PortMiami',25.772,-80.165,13,17,'district'],
  ['Miami International Airport',25.795,-80.278,12,17,'airport'], ['Everglades',25.696,-80.665,9,13,'park']
];

function getPoint(row) {
  if (!row || row.withheld || row.lat == null || row.lng == null || row.lat === '' || row.lng === '') return null;
  const lat = Number(row.lat), lng = Number(row.lng);
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 24 && lat <= 28 && lng >= -83 && lng <= -78 ? [lat,lng] : null;
}
function plainLabel(text, kind) {
  const span = document.createElement('span');
  span.className = 'bm-label-text bm-label-' + kind;
  span.textContent = text;
  return span;
}
function homeZoom(map) {
  const {x,y} = map.getSize();
  return Math.max(11.5, Math.min(12.75, 12.15 + Math.log2(Math.max(330, Math.min(x*1.1,y*1.35)) / 580)));
}

export function createAtlasMap(container, { onSelect, onBasemapChange, onExploreArea } = {}) {
  container.classList.add('buggy-atlas-map');
  container.setAttribute('role','region');
  container.setAttribute('aria-label','Interactive map of Miami homes. Use arrow keys to pan, plus and minus to zoom.');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const map = L.map(container, {
    center:HOME,zoom:12,minZoom:9.5,maxZoom:18,zoomSnap:.25,zoomDelta:1,
    zoomControl:false,attributionControl:false,scrollWheelZoom:true,wheelPxPerZoomLevel:115,
    maxBounds:coverage,maxBoundsViscosity:.91,keyboard:true,keyboardPanDelta:90,
    zoomAnimation:!motion.matches,fadeAnimation:!motion.matches,markerZoomAnimation:!motion.matches,
    renderer:L.canvas(),preferCanvas:true
  });
  map.setView(HOME,homeZoom(map),{animate:false});
  const initialParams=new URLSearchParams(location.search);
  const isOpeningHomeView=()=>!['schools','route'].includes(initialParams.get('mode')) &&
    !['q','view','property','map','school','home','browse','area'].some(key=>initialParams.has(key));
  let previewHomes=isOpeningHomeView(),userMoved=false,waitingForId=null;
  let gesturePending=false;
  const noteGesture=()=>{userMoved=true;gesturePending=true;};
  const gestures=new AbortController();
  container.addEventListener('wheel',noteGesture,{passive:true,signal:gestures.signal});
  container.addEventListener('dblclick',noteGesture,{signal:gestures.signal});
  container.addEventListener('touchstart',e=>{if(e.touches.length>1)noteGesture();},{passive:true,signal:gestures.signal});
  container.addEventListener('keydown',e=>{if(['ArrowUp','ArrowDown','ArrowRight','ArrowLeft','+','-','='].includes(e.key))noteGesture();},{signal:gestures.signal});
  map.on('dragstart boxzoomstart',noteGesture);
  let destroyed = false, matched = [], active = null, index = new Map(), moveFrame=0;
  let street, aerial, mode='homes', basemap='streets', routing=false;
  const pendingMarks=new Set();
  function markVisible(name,selector) {
    const key='buggy.map.'+name;
    if(!window.performance?.mark || pendingMarks.has(key) || performance.getEntriesByName(key).length) return;
    pendingMarks.add(key);
    requestAnimationFrame(()=>{
      pendingMarks.delete(key);
      if(destroyed)return;
      const width=document.documentElement.clientWidth,height=document.documentElement.clientHeight;
      const mapBox=container.getBoundingClientRect();
      const left=Math.max(0,mapBox.left),right=Math.min(width,mapBox.right);
      const top=Math.max(0,mapBox.top),bottom=Math.min(height,mapBox.bottom);
      if(right<=left||bottom<=top)return;
      const visible=[...container.querySelectorAll(selector)].some(el=>{
        const r=el.getBoundingClientRect();return r.width&&r.height&&r.right>left&&r.left<right&&r.bottom>top&&r.top<bottom;
      });
      if(visible)performance.mark(key);
    });
  }
  const routeGraphics=L.layerGroup().addTo(map);
  const routePane=map.createPane('atlasRoute');
  routePane.style.zIndex='450';
  routePane.style.pointerEvents='none';
  function loadStreets() {
    street?.remove();
    street=createStreetLayer(L,map,showStreetError,()=>markVisible('streets','.leaflet-tile-container canvas'));
  }
  function showStreetError() {
    const error = document.createElement('div');
    error.className='bm-map-error'; error.setAttribute('role','status');
    error.textContent='Street details could not load. ';
    const retry=document.createElement('button'); retry.type='button'; retry.textContent='Retry map';
    retry.addEventListener('click',()=>{error.remove();loadStreets();});
    error.append(retry);container.append(error);
  }
  loadStreets();
  const labelPane = map.createPane('atlasPlaces');
  labelPane.style.zIndex = '430'; labelPane.style.pointerEvents='none';
  const labels = L.layerGroup().addTo(map), markers = L.layerGroup().addTo(map);
  let activeMarker = null;
  const makeControl = L.Control.extend({
    options:{position:'topright'},
    onAdd() {
      const wrap=L.DomUtil.create('div','bm-controls');
      const add = (caption,html,action) => {
        const b=document.createElement('button'); b.type='button'; b.title=caption;
        b.setAttribute('aria-label',caption); b.innerHTML=html;
        L.DomEvent.disableClickPropagation(b); L.DomEvent.disableScrollPropagation(b);
        L.DomEvent.on(b,'click',e=>{L.DomEvent.stop(e);noteGesture();action();});
        wrap.appendChild(b);
        return b;
      };
      const plus=add('Zoom in','<span aria-hidden="true">+</span>',()=>map.setZoom(map.getZoom()+1,{animate:!motion.matches}));
      const minus=add('Zoom out','<span aria-hidden="true">−</span>',()=>map.setZoom(map.getZoom()-1,{animate:!motion.matches}));
      add('Reset to Miami',homeViewIcon,()=>fitHome());
      function state() { plus.disabled=map.getZoom()>=map.getMaxZoom();minus.disabled=map.getZoom()<=map.getMinZoom(); }
      map.on('zoomend',state);state();
      return wrap;
    }
  });
  new makeControl().addTo(map);
  const attribution = L.control.attribution({position:'bottomright',prefix:false}).addTo(map);
  attribution.addAttribution('<a href="https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html" target="_blank" rel="noopener">U.S. Census Bureau · TIGER/Line 2025</a>');
  L.control.scale({position:'bottomleft',imperial:true,metric:false,maxWidth:72}).addTo(map);

  function setMode(next) {
    const nextMode=next==='schools'?'schools':'homes';
    if(mode===nextMode)return;
    mode=nextMode;
    previewHomes=false;waitingForId=null;
    container.dataset.mode=mode;
    container.setAttribute('aria-label','Interactive map of Miami '+mode+'. Use arrow keys to pan, plus and minus to zoom.');
    map.closePopup();active=null;setRows([]);
  }
  function setBasemap(next) {
    next=next==='aerial'?'aerial':'streets';
    if(next===basemap)return;
    basemap=next;
    container.dataset.basemap=next;
    if(next==='aerial') {
      aerial=makeAerialLayer(L,map,container,attribution);
    } else {
      aerial?.remove();aerial=null;
    }
    onBasemapChange?.(next);
  }
  function clearRoute() {
    routeGraphics.clearLayers();
    routing=false;scheduleRefresh();
  }
  const compareColors=['#075fbd','#087c61','#923e86'];
  function validPath(path) {
    return Array.isArray(path)&&path.length>1&&path.every(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>24&&p[0]<28&&p[1]>-83&&p[1]<-78);
  }
  function routeRenderer() {
    const renderer=L.svg({pane:'atlasRoute',padding:.3});
    routeGraphics.addLayer(renderer);
    return {renderer,pane:'atlasRoute',interactive:false,opacity:1,lineCap:'round',lineJoin:'round',smoothFactor:.6};
  }
  function fitTripBounds(bounds) {
    const pad=Math.min(85,Math.max(38,Math.min(map.getSize().x,map.getSize().y)*.14));
    const zoom=Math.min(16.5,map.getBoundsZoom(bounds,false,[pad*2,pad*2]));
    centerAt(bounds.getCenter(),Math.max(map.getMinZoom(),zoom),true);
  }
  function setComparison(routes) {
    const trips=routes.filter(t=>validPath(t.coordinates)&&getPoint(t.home)&&getPoint(t.school)&&Number.isInteger(t.position)&&t.position>=0&&t.position<3).slice(0,3);
    if(!trips.length)return false;
    clearRoute();previewHomes=false;waitingForId=null;routing=true;
    const line=routeRenderer(),bounds=L.latLngBounds([getPoint(trips[0].home)]);
    for(const trip of trips){
      bounds.extend(getPoint(trip.school));bounds.extend(L.latLngBounds(trip.coordinates));
      L.polyline(trip.coordinates,{...line,color:'#fff',weight:8}).addTo(routeGraphics);
    }
    for(const trip of trips){
      const i=trip.position;
      L.polyline(trip.coordinates,{...line,color:compareColors[i],weight:i?4.7:5.8,
        dashArray:trips.length>1?['','9 5','3 6'][i]:null,className:'bm-compare-line'}).addTo(routeGraphics);
      const number=L.divIcon({className:'bm-compare-pin bm-compare-'+i,html:String(i+1),iconSize:[30,30],iconAnchor:[15,15]});
      const label=(i+1)+'. '+trip.school.name;
      const marker=L.marker(getPoint(trip.school),{icon:number,title:label,interactive:false,keyboard:false,zIndexOffset:1950}).addTo(routeGraphics);
      marker.getElement()?.setAttribute('aria-label',label);
    }
    const home=trips[0].home;
    const icon=L.divIcon({className:'bm-trip-pin bm-trip-home',html:houseIcon,iconSize:[32,32],iconAnchor:[16,16]});
    L.marker(getPoint(home),{icon,title:home.address,interactive:false,keyboard:false,zIndexOffset:1900}).addTo(routeGraphics);
    fitTripBounds(bounds);scheduleRefresh();return true;
  }
  function setRoute({coordinates=[],home,school,fit=true}={}) {
    clearRoute();
    previewHomes=false;waitingForId=null;
    const ends=[getPoint(home),getPoint(school)];
    if(ends.some(p=>!p))return false;
    const valid=validPath(coordinates);
    routing=true;
    // Use a dedicated SVG pane so the route remains crisp above the basemap and below its pins.
    if(valid) {
      const line=routeRenderer();
      L.polyline(coordinates,{...line,color:'#fff',weight:9}).addTo(routeGraphics);
      L.polyline(coordinates,{...line,color:'#1269df',weight:5.5,className:'bm-route-line'}).addTo(routeGraphics);
    }
    [home,school].forEach((row,i)=>{
      const label=i?(school.name||'School'):(home.address||'Home');
      const icon=L.divIcon({className:'bm-trip-pin '+(i?'bm-trip-school':'bm-trip-home'),html:i?schoolIcon:houseIcon,iconSize:[32,32],iconAnchor:[16,16]});
      const marker=L.marker(ends[i],{icon,interactive:false,keyboard:false,title:label,zIndexOffset:1800}).addTo(routeGraphics);
      marker.getElement()?.setAttribute('aria-label',label);
      if(!i && map.distance(ends[0],ends[1])<20)marker.setOpacity(.55);
    });
    if(fit) {
      const bounds=L.latLngBounds(ends);
      if(valid)bounds.extend(L.latLngBounds(coordinates));
      fitTripBounds(bounds);
    }
    scheduleRefresh();
    return valid;
  }
  function rowName(row) {return mode==='schools'?row.name||row.address||'School':row.address||'Home';}

  function centerAt(point,zoom,animate=true) {
    if (destroyed) return;
    // A stopped motion must dispatch its final move events before a later navigation.
    map.stop();
    if (!animate || motion.matches) { map.setView(point,zoom,{animate:false});return; }
    if (Math.abs(map.getZoom()-zoom)<.05 && map.distance(map.getCenter(),point)<8) return;
    map.flyTo(point,zoom,{animate:true,duration:.77,easeLinearity:.36});
  }
  function fitHome(options={}) { centerAt(HOME,homeZoom(map),options.animate!==false); }

  function updateLabels(bounds,zoom,occupied) {
    labels.clearLayers();
    for (const [text,lat,lng,start,end,kind] of placeLabels) {
      if (zoom<start || zoom>end || !bounds.contains([lat,lng])) continue;
      const anchor=map.latLngToContainerPoint([lat,lng]);
      const halfWidth=Math.min(115, text.length*(kind==='city'?5.5:3.6)+3);
      const halfHeight=kind==='city'?12:8;
      const offsets=[0,-19,19,-34,34];
      const dy=offsets.find(offset=>occupied.every(p=>Math.abs(anchor.x-p.x)>halfWidth+p.w+2 || Math.abs(anchor.y+offset-p.y)>halfHeight+p.h+2));
      if (dy===undefined) continue;
      occupied.push({x:anchor.x,y:anchor.y+dy,w:halfWidth,h:halfHeight});
      const icon=L.divIcon({className:'bm-label',html:plainLabel(text,kind),iconSize:[0,0],iconAnchor:[0,-dy]});
      L.marker([lat,lng],{icon,pane:'atlasPlaces',interactive:false,keyboard:false}).addTo(labels);
    }
  }
  function pin(mark,kind,text,label,go,group,zIndex=0) {
    const content=document.createElement('span');
    content.className='bm-symbol bm-'+kind;
    if (kind==='cluster') {
      const pip=document.createElement('i');
      pip.setAttribute('aria-hidden','true');content.append(pip,document.createTextNode(text));
    } else { content.innerHTML=mode==='schools'?schoolIcon:houseIcon; }
    const icon=L.divIcon({className:'bm-marker',html:content,iconSize:kind==='cluster'?[50,42]:[42,44],iconAnchor:kind==='cluster'?[25,21]:kind==='selected'?[21,46]:[21,39]});
    const marker=L.marker(mark,{icon,title:label,alt:label,zIndexOffset:zIndex,riseOnHover:true,autoPanOnFocus:false}).addTo(group);
    marker.getElement()?.setAttribute('aria-label',label);
    marker.on('click',go);
    return marker;
  }
  function openingPins(bounds,zoom,occupied,reserve) {
    // Spatial groups cover the complete county snapshot. Tapping them immediately moves the
    // camera, even while full address records and property search are loading.
    const z=Math.max(11,Math.min(13,Math.round(zoom)));
    for(const group of homeOverview[z-11]) {
      const [count,lat,lng]=group,point=[lat,lng];
      if(!bounds.contains(point))continue;
      if(count===1){
        const id=group[3],name=group[4]||'Home';
        reserve(point,14,15,-14);
        pin(point,waitingForId===id?'selected':'home','',name,()=>{
          noteGesture();waitingForId=id;
          centerAt(point,Math.max(16.5,zoom),true);scheduleRefresh();
        },markers);
      }else{
        reserve(point,21,13);
        const label=formatter.format(count)+' homes. Zoom to explore';
        const text=count>=1000?(count/1000).toFixed(count>=10000?0:1).replace(/\.0$/,'')+'k':String(count);
        pin(point,'cluster',text,label,()=>{
          noteGesture();waitingForId=null;
          const groupBounds=L.latLngBounds([group[3],group[4]],[group[5],group[6]]);
          const pad=Math.max(25,Math.min(70,Math.min(map.getSize().x,map.getSize().y)*.1));
          const fitted=map.getBoundsZoom(groupBounds,false,[pad*2,pad*2]);
          const next=Math.min(16.5,zoom+2,Math.max(zoom+.75,fitted));
          centerAt(groupBounds.getCenter(),Math.max(zoom,next),true);
        },markers);
      }
    }
    updateLabels(bounds,zoom,occupied);
    if(markers.getLayers().length)markVisible('markers','.bm-marker .bm-symbol');
  }
  function refresh() {
    if (destroyed || !container.clientWidth || !container.clientHeight) return;
    if(container.classList.contains('bm-cartography-ready') && basemap==='streets')markVisible('streets','.leaflet-tile-container canvas');
    const bounds=map.getBounds().pad(.08), zoom=map.getZoom();
    markers.clearLayers();
    const occupied=[];
    function reserve(point,w,h,dy=0) {const p=map.latLngToContainerPoint(point);occupied.push({x:p.x,y:p.y+dy,w,h});}
    if (activeMarker) {activeMarker.remove();activeMarker=null;}
    if(previewHomes){openingPins(bounds,zoom,occupied,reserve);return;}
    if(routing) {updateLabels(bounds,zoom,occupied);return;}
    const activePoint=getPoint(active);
    const cell=zoom<13 ? 121 : zoom<15 ? 101 : zoom<17 ? 74 : 45;
    const scale=2**(zoom-16), groups=new Map();
    for (const item of matched) {
      if (item.row.id===active?.id || !bounds.contains(item.point)) continue;
      const key=Math.floor(item.x*scale/cell)+','+Math.floor(item.y*scale/cell);
      let group=groups.get(key);
      if (!group) {group={rows:[],sumLat:0,sumLng:0};groups.set(key,group);}
      group.rows.push(item);group.sumLat+=item.point[0];group.sumLng+=item.point[1];
    }
    for (const group of groups.values()) {
      const n=group.rows.length, row=group.rows[0].row;
      if (n===1) {
        reserve(group.rows[0].point,14,15,-14);
        pin(group.rows[0].point,'home','',rowName(row),()=>{select(row,{animate:false,center:false});onSelect?.(row);},markers);
      } else {
        const center=[group.sumLat/n,group.sumLng/n];
        reserve(center,21,13);
        const count=n>=1000 ? (n/1000).toFixed(n>=10000?0:1).replace(/\.0$/,'')+'k' : String(n);
        pin(center,'cluster',count,formatter.format(n)+' '+mode+'. Zoom to explore',()=>{
          if (zoom>=map.getMaxZoom()-.05) return showCoincident(group,center);
          noteGesture();
          fitRows(group.rows.map(item=>item.row),{maximumZoom:Math.min(18,zoom+2.3)});
        },markers);
      }
    }
    if (activePoint && bounds.contains(activePoint)) {
      const row=active;
      reserve(activePoint,20,21,-16);
      activeMarker=pin(activePoint,'selected','',rowName(row),()=>onSelect?.(row),map,1100);
    }
    updateLabels(bounds,zoom,occupied);
    if(groups.size||activeMarker)markVisible('markers','.bm-marker .bm-symbol');
  }
  function showCoincident(group,center) {
    const list=document.createElement('div');list.className='bm-address-popup';
    const title=document.createElement('strong');title.textContent=formatter.format(group.rows.length)+' '+mode+' here';list.append(title);
    for (const {row} of group.rows) {
      const button=document.createElement('button');button.type='button';button.textContent=rowName(row);
      button.addEventListener('click',()=>{map.closePopup();select(row,{animate:false,center:false});onSelect?.(row);});
      list.append(button);
    }
    L.popup({maxWidth:272,autoPan:true,closeButton:true}).setLatLng(center).setContent(list).openOn(map);
  }
  function scheduleRefresh() {
    if (destroyed || moveFrame) return;
    moveFrame=requestAnimationFrame(()=>{moveFrame=0;refresh();});
  }
  function setRows(rows) {
    previewHomes=false;
    index=new Map();matched=[];
    for (const row of Array.isArray(rows)?rows:[]) {
      const point=getPoint(row);
      if (!point || index.has(row.id)) continue;
      const xy=map.project(point,16);
      index.set(row.id,row);
      matched.push({row,point,x:xy.x,y:xy.y});
    }
    if (active&&!index.has(active.id)) active=null;
    if(waitingForId){
      const deferred=index.get(waitingForId);waitingForId=null;
      if(deferred && mode==='homes') queueMicrotask(()=>{
        if(!destroyed && mode==='homes' && index.get(deferred.id)===deferred)onSelect?.(deferred);
      });
    }
    scheduleRefresh();
  }
  function select(idOrRow,options={}) {
    const row=typeof idOrRow==='object' ? idOrRow : index.get(idOrRow);
    if (!row) {active=null;scheduleRefresh();return false;}
    const point=getPoint(row);
    if (!point) return false;
    active=row;map.closePopup();scheduleRefresh();
    if (options.animate!==false) centerAt(point,Math.max(map.getZoom(),16.5),true);
    else if (options.center!==false) centerAt(point,Math.max(map.getZoom(),16.5),false);
    return true;
  }
  function fitRows(rows,options={}) {
    const points=(Array.isArray(rows)?rows:[]).map(getPoint).filter(Boolean);
    if (!points.length) return false;
    const bounds=L.latLngBounds(points), max=options.maximumZoom ?? 16.5;
    const pad=Math.min(74,Math.max(24,Math.min(map.getSize().x,map.getSize().y)*.1));
    const zoom=Math.min(max,map.getBoundsZoom(bounds,false,[pad*2,pad*2]));
    centerAt(bounds.getCenter(),Math.max(map.getMinZoom(),zoom),options.animate!==false);
    return true;
  }
  function resize() { if (!destroyed) {map.invalidateSize({animate:false,pan:false});scheduleRefresh();} }
  function visibleArea() {
    const b=map.getBounds();
    return encodeArea([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()]);
  }
  function restoreArea(box) {
    if (!box || visibleArea()===encodeArea(box)) return;
    const [west,south,east,north]=box;
    gesturePending=false;
    map.stop().fitBounds([[south,west],[north,east]],{padding:[0,0],animate:false,maxZoom:18});
  }
  map.on('moveend',()=>{
    if(gesturePending){gesturePending=false;onExploreArea?.(visibleArea());}
  });
  map.on('moveend zoomend resize',scheduleRefresh);
  const observer=typeof ResizeObserver==='function' ? new ResizeObserver(resize) : null;
  observer?.observe(container);
  scheduleRefresh();
  return {
    visibleArea,restoreArea,setRows,setMode,setBasemap,setRoute,setComparison,clearRoute,select,fitRows,fitHome,reset:fitHome,resize,hasUserMoved:()=>userMoved,
    destroy(){destroyed=true;gestures.abort();aerial?.remove();observer?.disconnect();cancelAnimationFrame(moveFrame);map.remove();container.classList.remove('buggy-atlas-map');}
  };
}
