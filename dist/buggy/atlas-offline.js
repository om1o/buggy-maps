// Only same-origin, public atlas assets are eligible. Family and staff pages never enter this cache.
const version = 'buggy-atlas-map-brief-20261126';
const shellCache = version+'-public';
const photoCache = version+'-photos';
const base = new URL('./',self.location.href);
const here = path => new URL(path,base).href;
const startup = ['./','./atlas.js','./atlas.css','./explore-modes.js','./school-mode.js','./explore-controls.css',
  './area-search.js','./place-search.js','./buggy-schools.js','./school-discovery.js','./school-discovery.css',
  './saved-places.js','./saved-places.css','./commute-workspace.js','./share-link.js','./parent-actions.js','./parent-actions.css','./trip-location.js','./journey-layout.js','./journey-layout.css',
  './map-experience.js','./map-experience.css','./map-engine.js','./map-engine.css','./language.js',
  './data-loader.js','./home-rows.js','./map-assets/home-overview.js','./search.js','./county.js','./listing-tour.js','./listing-tour.css','./ride-check.js','./ride-check.css',
  './assets/buggy-logo.png','./map-assets/leaflet.js','./map-assets/leaflet.css','./map-assets/cartography.js','./map-assets/aerial.js','./map-assets/miami.vmap',
  './trip-planner.js','./trip-planner.css','./trip-routing.js','./ride-data.js','./ride-config.js',
  './client-brief.html','./client-brief.css','./client-brief.js','./school-brief.js','./agent-tools.json',
  './map-assets/road-network.js','./map-assets/route-worker.js','./map-assets/miami-drive.rnet','./map-assets/miami-aerial-overview.webp',
  './data/gallery-homes.json','./data/index.json.gz','./data/search-places.json.gz','./data/coverage.json','./data/property-aliases.json','./data/media.json.gz','./data/schools.json.gz'];
const initialPaths=new Set(startup.map(p=>new URL(p,base).pathname));
const assetCache=pathname=>{
  if(initialPaths.has(pathname)) return shellCache;
  const prefix=base.pathname;
  if(!pathname.startsWith(prefix))return null;
  const path=pathname.slice(prefix.length);
  if(/^media\/(?:aerial|county-tiles|exterior|schools(?:\/preview)?)\/[\w.-]+\.(?:webp|jpg|jpeg|avif)$/.test(path))return photoCache;
  if(/^data\/(?:county|properties)\/[\w-]+\.json(?:\.gz)?$/.test(path))return photoCache;
  return null;
};
self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(shellCache);
    const shell=await fetch(here('./'),{cache:'reload'});
    if(!shell.ok)throw Error('Atlas offline shell unavailable');
    await cache.put(here('./'),shell);
    // Take advantage of the browser HTTP cache and avoid delaying the first interactive view.
    for(let i=1;i<startup.length;i+=4)await Promise.allSettled(startup.slice(i,i+4).map(async path=>{
      const url=here(path);
      const mutable=/\.(?:js|css)$/.test(path);
      const resource=await fetch(url,{cache:mutable?'reload':'force-cache'});
      if(resource.ok && (path==='./client-brief.html' || !resource.headers.get('content-type')?.includes('text/html')))await cache.put(url,resource);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const name of await caches.keys())if(name.startsWith('buggy-atlas-map-')&&name!==shellCache&&name!==photoCache)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request,url=new URL(request.url);
  if(request.method!=='GET'||url.origin!==base.origin)return;
  const chosen=assetCache(url.pathname);if(!chosen)return;
  const isNavigation=request.mode==='navigate';
  if(isNavigation && url.pathname!==base.pathname && url.pathname!==base.pathname+'client-brief.html')return;
  const key=new URL(url.pathname,base).href;
  event.respondWith((async()=>{
    const cache=await caches.open(chosen);
    async function download(){
      const response=await fetch(request);
      if(!response.ok){const stored=await cache.match(key);return stored||response;}
      if(!isNavigation&&response.headers.get('content-type')?.includes('text/html'))return response;
      const copy=response.clone();
      event.waitUntil((async()=>{
        await cache.put(key,copy);
        if(chosen===photoCache){
          const keys=await cache.keys();
          if(keys.length>36)await Promise.all(keys.slice(0,keys.length-36).map(k=>cache.delete(k)));
        }
      })().catch(()=>{}));
      return response;
    }
    // Revalidate code and the page on each visit; data and immutable geography are tied to this release.
    const revalidate=isNavigation||/\.(?:js|css)$/.test(url.pathname);
    if(!revalidate){const cached=await cache.match(key);if(cached)return cached;}
    try{return await download();}catch(error){const cached=await cache.match(key);if(cached)return cached;throw error;}
  })());
});
