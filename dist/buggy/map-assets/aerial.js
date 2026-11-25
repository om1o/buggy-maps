const base = 'https://gisweb.miamidade.gov/arcgis/rest/services/MapCache/MDCImagery_WebMercator/MapServer';
const overviewBounds = [[25.15,-80.90],[26.035,-80.045]];
const world = 40075016.68557849;
const knownTiles = '-8715_2903 -8716_2903 -8716_2909 -8716_2910 -8716_2911 -8717_2903 -8717_2906 -8717_2907 -8717_2908 -8717_2909 -8717_2910 -8717_2911 -8718_2899 -8718_2904 -8718_2905 -8718_2906 -8718_2907 -8718_2908 -8718_2909 -8718_2910 -8718_2911 -8719_2898 -8719_2899 -8719_2900 -8719_2901 -8719_2902 -8719_2903 -8719_2904 -8719_2905 -8719_2906 -8719_2907 -8719_2908 -8719_2909 -8719_2910 -8720_2898 -8720_2899 -8720_2900 -8720_2901 -8720_2902 -8720_2903 -8720_2904 -8720_2905 -8720_2906 -8720_2907 -8720_2908 -8720_2909 -8720_2910 -8721_2896 -8721_2897 -8721_2898 -8721_2899 -8721_2900 -8721_2901 -8721_2902 -8721_2903 -8721_2904 -8721_2905 -8721_2906 -8721_2907 -8721_2908 -8721_2909 -8722_2896 -8722_2897 -8722_2898 -8722_2899 -8722_2900 -8722_2901 -8722_2902 -8722_2903 -8722_2904 -8722_2905 -8722_2906 -8722_2907 -8722_2908 -8722_2909 -8723_2896 -8723_2897 -8723_2898 -8723_2899 -8723_2900 -8723_2901 -8723_2902 -8723_2903 -8723_2904 -8723_2905 -8724_2893 -8724_2894 -8724_2895 -8724_2896 -8724_2897 -8724_2898 -8724_2899 -8724_2900 -8724_2901 -8724_2902 -8724_2903 -8725_2893 -8725_2894 -8725_2895 -8725_2896 -8725_2897 -8725_2898 -8725_2899 -8725_2900 -8725_2901 -8725_2902 -8725_2903 -8726_2893 -8726_2894 -8726_2895 -8726_2900 -8726_2901 -8726_2902 -8727_2900 -8727_2901 -8727_2902 -8728_2900 -8728_2901 -8729_2900 -8729_2901 -8730_2900 -8730_2901 -8731_2900 -8731_2901 -8732_2900'.split(' ').map(name=>{const [x,y]=name.split('_').map(Number);return {name,x,y};});
const credit = '<a href="'+base+'" target="_blank" rel="noopener">Miami-Dade County GIS aerial imagery</a>';

// The county's cache uses a custom tile origin. Request exact EPSG:3857 tile bounds
// instead of passing XYZ coordinates to a cache with different scale levels.
export function countyTileUrl({x,y,z}) {
  const size=world/2**z;
  const west=x*size-world/2, north=world/2-y*size;
  const params=new URLSearchParams({bbox:[west,north-size,west+size,north].map(v=>v.toFixed(3)).join(','),bboxSR:'3857',imageSR:'3857',size:'256,256',format:'jpg',f:'image'});
  return base+'/export?'+params;
}

// The property archive includes county photographs on a 1,024 m Web Mercator grid
// with 128 m gutters. Re-use them as a detailed fallback only where coverage exists.
function backupTiles(L, map, group, paneName) {
  const layers=new Map();
  function show() {
    const bounds=map.getBounds(),zoom=map.getZoom();
    const visible=new Set();
    if(zoom>=15){
      for(const {name,x,y} of knownTiles){
        const corner=(east,north)=>L.CRS.EPSG3857.unproject(L.point(east,north));
        const tileBounds=L.latLngBounds(corner(x*1024-128,y*1024-128),corner((x+1)*1024+128,(y+1)*1024+128));
        if(!bounds.intersects(tileBounds))continue;
        visible.add(name);
        if(layers.has(name))continue;
        const url=new URL('../media/county-tiles/'+name+'.webp',import.meta.url);
        const img=L.imageOverlay(url.href,tileBounds,{pane:paneName,interactive:false,zIndex:1,alt:''}).addTo(group);
        layers.set(name,img);
      }
    }
    for(const [name,img] of layers)if(!visible.has(name)){group.removeLayer(img);layers.delete(name);}
  }
  return show;
}

export function makeAerialLayer(L,map,container,attribution) {
  const paneName='atlasAerial';
  const pane=map.getPane(paneName)||map.createPane(paneName);
  pane.style.zIndex='260';pane.style.pointerEvents='none';
  const options={pane:paneName,interactive:false};
  const group=L.layerGroup().addTo(map);
  const overview=L.imageOverlay(new URL('./miami-aerial-overview.webp',import.meta.url).href,overviewBounds,{...options,alt:'Saved overview of Miami-Dade County aerial imagery',zIndex:0}).addTo(group);
  const CountyTiles=L.TileLayer.extend({getTileUrl:countyTileUrl});
  const detail=new CountyTiles('',{...options,bounds:overviewBounds,tileSize:256,minZoom:13,maxZoom:18,noWrap:true,keepBuffer:1,updateWhenIdle:true,zIndex:2}).addTo(group);
  attribution.addAttribution(credit);
  const status=document.createElement('span');
  status.className='bm-aerial-status';status.setAttribute('role','status');status.hidden=true;container.append(status);
  const showCached=backupTiles(L,map,group,paneName);
  let buffering=false;
  const show=()=>{
    if(!buffering){buffering=true;map.on('moveend zoomend',showCached);}
    showCached();status.hidden=false;
    status.textContent=document.documentElement.lang.startsWith('es')?'Algunas áreas usan imágenes aéreas guardadas.':'Some areas use saved county aerial imagery.';
  };
  detail.on('tileerror',show);overview.on('error',()=>{if(!status.hidden)status.textContent='Aerial imagery is unavailable for this area.';});
  return {remove(){detail.off('tileerror',show);map.off('moveend zoomend',showCached);group.remove();status.remove();attribution.removeAttribution(credit);}};
}
