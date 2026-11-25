import { currentMapParams, publicMapParams, setMapHref } from './trip-location.js';
import { attachListingTour, hasListingTour } from './listing-tour.js';
import { mountRideCheck } from './ride-check.js';

const byId = id => document.getElementById(id);
const featuredId = 'county-0141290000480';
const format = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function makeMapExperience({ choose, onLayerChange, onExploreArea, addHomeTools, mediaFor, cropAttributes, viewName, photoCredit, esc, watchImage, rideOptions }) {
  const card = byId('map-card');
  const sheet = byId('map-sheet');
  const toggle = byId('sheet-toggle');
  let map, loading, current, latest, releaseMedia, releaseRide, lastRows, lastKey;
  let hasApplied=false;
  let dragStart = null;
  let markerMode='homes', baseLayer='streets', drawnTrip=null, comparison=[], compareFrame=0;
  const tripPanel=byId('trip-panel');

  function expand(value) {
    sheet.dataset.expanded = String(value);
    toggle.setAttribute('aria-expanded', String(value));
    toggle.lastElementChild.textContent = value ? 'Collapse property card' : 'Expand property card';
  }
  toggle.addEventListener('click', () => expand(sheet.dataset.expanded !== 'true'));
  toggle.addEventListener('touchstart', event => { dragStart = event.touches[0].clientY; }, { passive: true });
  toggle.addEventListener('touchend', event => {
    if (dragStart === null) return;
    const delta = event.changedTouches[0].clientY - dragStart;
    dragStart = null;
    if (Math.abs(delta) > 18) { event.preventDefault(); expand(delta < 0); }
  }, { passive: false });

  function cleanup() {
    releaseMedia?.();
    releaseRide?.();
    releaseMedia = releaseRide = null;
    current = null;
  }
  function gallery(container, row) {
    const media = mediaFor(row).filter(item => !item.publisher);
    let index = 0;
    const frame = document.createElement('div');
    frame.className = 'map-photo';
    const caption = document.createElement('div');
    caption.className = 'map-photo-caption';
    const pagination = document.createElement('div');
    pagination.className = 'map-photo-pager';
    const status = document.createElement('span');
    status.setAttribute('aria-live', 'polite');
    function draw() {
      releaseMedia?.();
      const image = media[index];
      frame.innerHTML = '<img' + cropAttributes(image) + ' src="' + esc(image.url) + '" alt="' + esc(image.alt || (viewName(image) + ' of ' + row.address)) + '" decoding="async">';
      releaseMedia = watchImage(frame.firstElementChild,frame,{retryHost:frame,routeManaged:false});
      status.textContent = (index + 1) + ' / ' + media.length;
      caption.innerHTML = '<strong>' + esc(viewName(image)) + '</strong> ' + photoCredit(image);
    }
    if (media.length) {
      container.append(frame);
      if (media.length > 1) {
        const change = delta => { index = (index + delta + media.length) % media.length; draw(); };
        for (const [label,symbol,delta] of [['Previous photo','‹',-1],['Next photo','›',1]]) {
          const button = document.createElement('button');
          button.type = 'button'; button.textContent = symbol; button.setAttribute('aria-label',label);
          button.addEventListener('click', () => change(delta));
          pagination.append(button);
          if (delta === -1) pagination.append(status);
        }
        container.append(pagination);
        let start;
        frame.addEventListener('touchstart', e => { start = [e.touches[0].clientX,e.touches[0].clientY]; },{passive:true});
        frame.addEventListener('touchend', e => {
          if (!start) return;
          const dx=e.changedTouches[0].clientX-start[0],dy=e.changedTouches[0].clientY-start[1];
          if (Math.abs(dx)>44 && Math.abs(dx)>Math.abs(dy)*1.4) change(dx<0?1:-1);
          start=null;
        },{passive:true});
      }
      container.append(caption);
      draw();
    } else {
      const note = document.createElement('p');
      note.className = 'map-subtitle'; note.textContent = 'An address-matched photograph is unavailable for this record.';
      container.append(note);
    }
    if (hasListingTour(row.id)) {
      const button=document.createElement('button');
      button.type='button'; button.className='map-secondary'; button.textContent='Open listing photo tour';
      button.addEventListener('click',() => {button.remove(); attachListingTour(container,row);});
      container.append(button);
    }
  }
  function homeParams(id, full=false) {
    const params=currentMapParams();
    params.delete('property'); params.delete('page'); params.set('map',id);
    if(full) params.set('property',id);
    return params;
  }
  function safeHref(params){
    const query=publicMapParams(params).toString();
    return esc(query?'?'+query:'./');
  }
  function showCard(row, mode, matches, term) {
    cleanup(); current = row;
    if (mode === 'results' || !row) {
      const homes = matches.slice(0,4);
      card.innerHTML = '<div class="map-intro"><p class="map-overline">Map results</p><h1 class="map-heading">'+
        (matches.length ? format.format(matches.length)+' '+(matches.length===1?'home':'homes') : 'No matching homes')+
        '</h1><p class="map-subtitle">'+esc(term ? 'Search for “'+term+'”' : 'In this view')+'</p></div>'+
        '<div class="map-result-list">'+homes.map(home=>'<a href="'+safeHref(homeParams(home.id))+'"><strong>'+esc(home.address||'Address withheld')+'</strong><small>'+esc([home.city,home.zip].filter(Boolean).join(' · '))+'</small></a>').join('')+'</div>'+
        '<div class="map-card-actions"><button class="map-secondary" type="button" data-list>View results list</button><a class="map-secondary" href="./">Reset map</a></div>';
      card.querySelectorAll('.map-result-list a').forEach((a,i)=>setMapHref(a,homeParams(homes[i].id)));
      card.querySelector('[data-list]').addEventListener('click',()=>{ byId('directory').focus({preventScroll:true}); byId('directory').scrollIntoView(); });
      return;
    }
    const featured=mode==='overview';
    const neighborhood=row._places?.find(place=>place.label==='Neighborhood')?.name;
    const locality=[neighborhood||row.city, row.state, row.zip].filter(Boolean).join(' · ');
    const facts=[['Beds',row.beds],['Baths',row.baths],['Living area',row.sqft ? format.format(row.sqft)+' ft²' : null]].filter(([,value])=>value!=null);
    const detail=homeParams(row.id,true), pin=homeParams(row.id);
    const detailURL=safeHref(detail),pinURL=safeHref(pin);
    const tripParams=new URLSearchParams({mode:'route',home:row.id});
    const school=currentMapParams().get('school');if(school)tripParams.set('school',school);
    const planURL=safeHref(tripParams);
    card.innerHTML='<div class="map-intro"><p class="map-overline">'+(featured?'Featured home':'Selected home')+'</p><h1 class="map-heading">'+esc(row.address||'Address withheld')+'</h1><p class="map-subtitle">'+esc(locality)+'</p></div>'+
      '<div class="map-media-panel"></div>'+
      (facts.length?'<dl class="map-facts">'+facts.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value)+'</dd></div>').join('')+'</dl>':'')+
      (featured?'<p class="map-hint">Tap a cluster to explore, or fly to this home.</p>':'')+
      (!featured && (!Number.isFinite(row.lat)||!Number.isFinite(row.lng)||row.withheld)?'<p class="map-hint">Precise map location unavailable.</p>':'')+
      '<div class="map-card-actions">'+(!row.withheld?'<a class="map-primary plan-trip-link" href="'+planURL+'">Plan school route</a>':'')+(featured?'<a class="map-secondary" data-pin-home href="'+pinURL+'">Fly to this home <span aria-hidden="true">↗</span></a>':'')+
      '<a class="map-secondary" data-home-details href="'+detailURL+'">Full property record <span aria-hidden="true">↗</span></a></div>'+
      '<details class="map-ride"><summary>Check my school ride</summary><div id="map-ride-content"></div></details>';
    const trip=card.querySelector('.plan-trip-link');if(trip)setMapHref(trip,tripParams);
    const pinLink=card.querySelector('[data-pin-home]');if(pinLink)setMapHref(pinLink,pin);
    setMapHref(card.querySelector('[data-home-details]'),detail);
    gallery(card.querySelector('.map-media-panel'),row);
    if(!featured) addHomeTools?.(card,row);
    const ride=card.querySelector('.map-ride');
    ride.addEventListener('toggle',()=>{
      if(ride.open && current===row && !releaseRide) {
        expand(true);
        releaseRide=mountRideCheck(byId('map-ride-content'),row,rideOptions(row));
      }
    });
  }
  function apply() {
    if(!map || !latest || byId('home').hidden) return;
    const {all,rows,mode,row,key}=latest;
    map.setMode(markerMode);
    if (drawnTrip || comparison.length) {
      if(lastRows!==rows) {map.setRows(rows);lastRows=rows;}
      map.resize();if(comparison.length)map.setComparison?.(comparison);else map.setRoute(drawnTrip);hasApplied=true;lastKey=key;return;
    }
    if(lastRows!==rows) {
      map.setRows(rows); lastRows=rows;
    }
    map.resize();
    if(lastKey!==key) {
      if((mode==='home'||mode==='school'||mode==='route') && row) {
        if (!map.select(row,{animate:true})) {map.select(null); map.fitHome();}
      } else {
        map.select(null);
        if(latest.area)map.restoreArea?.(latest.area);
        else if((mode==='results'||mode==='school-search') && rows.length && rows!==all) map.fitRows(rows,{animate:true});
        else if(mode!=='overview' || hasApplied || !map.hasUserMoved())map.fitHome();
      }
      lastKey=key;
    }
    hasApplied=true;
  }
  function prepare() {
    if(loading) return;
    loading=import('./map-engine.js').then(({createAtlasMap})=>{
      map=createAtlasMap(byId('atlas-map'),{onSelect:row=>choose(row,markerMode),onExploreArea,onBasemapChange:name=>{baseLayer=name;onLayerChange?.(name);}});
      map.setBasemap(baseLayer);
      apply();
    }).catch(()=>{
      loading=null;
      byId('atlas-map').innerHTML='<div class="map-offline" role="status">The map could not open. You can still search an address. <button type="button">Retry map</button></div>';
      byId('atlas-map').querySelector('button').onclick=()=>{byId('atlas-map').replaceChildren();prepare();};
    });
  }
  prepare();
  return {
    visibleArea(){return map?.visibleArea?.() || '';},
    suspend(){ cleanup(); latest=null; lastKey=null; drawnTrip=null;comparison=[];map?.clearRoute(); },
    setBasemap(name){if(name!==baseLayer){baseLayer=name;map?.setBasemap(name);}},
    paintRoute(trip){drawnTrip=trip;if(!comparison.length && map && latest && !byId('home').hidden)map.setRoute(trip);},
    paintComparison(trips){
      const previous=comparison.length;comparison=trips||[];
      if(!map||!latest||byId('home').hidden||(!previous&&!comparison.length))return;
      cancelAnimationFrame(compareFrame);
      compareFrame=requestAnimationFrame(()=>{
        if(!map||!latest||byId('home').hidden)return;
        if(comparison.length)map.setComparison?.(comparison);
        else if(drawnTrip)map.setRoute(drawnTrip);
        else map.clearRoute();
      });
    },
    clearRoute(){drawnTrip=null;comparison=[];cancelAnimationFrame(compareFrame);map?.clearRoute();},
    showSchools({rows,all=rows,row=null,key,mode='school',markers='schools',area=null}) {
      cleanup();card.hidden=true;tripPanel.hidden=false;
      if(markerMode!==markers){markerMode=markers;lastRows=null;lastKey=null;}
      if(latest?.key!==key){drawnTrip=null;comparison=[];cancelAnimationFrame(compareFrame);map?.clearRoute();}
      latest={all,rows,mode,row,key,area};apply();if(!map)prepare();
    },
    show({all,rows=all,row,mode='overview',term='',key=mode,area=null}) {
      if(markerMode!=='homes'){markerMode='homes';lastRows=null;lastKey=null;}
      if(drawnTrip||comparison.length){drawnTrip=null;comparison=[];cancelAnimationFrame(compareFrame);map?.clearRoute();}
      card.hidden=false;tripPanel.hidden=true;
      const display=row || (mode==='overview' ? all.find(home=>home.id===featuredId)||all[0] : null);
      if (mode==='home' && latest?.row?.id!==row?.id) expand(false);
      if (mode==='overview') expand(false);
      latest={all,rows,mode,row:display,key,area};
      showCard(display,mode,rows,term);
      apply(); if(!map) prepare();
    }
  };
}

export function initBrandFilm() {
  const film=byId('buggy-film');
  if (!film || !window.IntersectionObserver || navigator.connection?.saveData) return;
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const observer=new IntersectionObserver(entries=>{
    if(!entries[0].isIntersecting || motion.matches) return;
    observer.disconnect(); film.src='./assets/buggy-arrival.mp4'; film.play().catch(()=>film.load());
  },{threshold:0.25});
  observer.observe(film);
  motion.addEventListener?.('change',()=>{if(motion.matches){film.pause();film.removeAttribute('src');film.load();}});
}
