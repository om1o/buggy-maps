// Miami-Dade County property records. Only the listed physical and assessment fields are requested.
const layer = 'https://gisweb.miamidade.gov/arcgis/rest/services/MD_SQLPictometry_Connect/MapServer/0';
const countySource = 'Miami-Dade County Property Appraiser';
const countyViewer = 'https://apps.miamidadepa.gov/propertysearch/';
const imageryService = 'https://gisweb.miamidade.gov/arcgis/rest/services/MapCache/MDCImagery_WebMercator/MapServer';
const fields = [
  'FOLIO','TRUE_SITE_ADDR','TRUE_SITE_ADDR_NO_UNIT','TRUE_SITE_UNIT','TRUE_SITE_CITY','TRUE_SITE_ZIP_CODE',
  'DOR_DESC','DOR_CODE_CUR','BEDROOM_COUNT','BATHROOM_COUNT','HALF_BATHROOM_COUNT','YEAR_BUILT',
  'FLOOR_COUNT','LOT_SIZE','BUILDING_ACTUAL_AREA','BUILDING_HEATED_AREA','BUILDING_EFFECTIVE_AREA',
  'ASSESSMENT_YEAR_CUR','ASSESSED_VAL_CUR','ASSESSMENT_YEAR_PRI','ASSESSED_VAL_PRI',
  'DOS_1','PRICE_1','DOS_2','PRICE_2','DOS_3','PRICE_3',
];
const publicResidential = "CANCEL_FLAG = 'N' AND REFERENCE_ONLY_FLAG = 'N' AND DOR_CODE_CUR >= '0100' AND DOR_CODE_CUR < '1000'";
const cache = new Map();
const suffixes = {
  STREET:'ST',AVENUE:'AVE',AV:'AVE',TERRACE:'TER',TERR:'TER',DRIVE:'DR',COURT:'CT',ROAD:'RD',
  CIRCLE:'CIR',LANE:'LN',PLACE:'PL',BOULEVARD:'BLVD',PARKWAY:'PKWY',HIGHWAY:'HWY',TRAIL:'TRL',
  NORTHWEST:'NW',SOUTHWEST:'SW',NORTHEAST:'NE',SOUTHEAST:'SE',NORTH:'N',SOUTH:'S',EAST:'E',WEST:'W',
};
const cities = /\s+(?:MIAMI(?: BEACH| LAKES| GARDENS| SHORES| SPRINGS)?|NORTH MIAMI(?: BEACH)?|SOUTH MIAMI|WEST MIAMI|CORAL GABLES|DORAL|HIALEAH(?: GARDENS)?|HOMESTEAD|KENDALL|PINECREST|KEY BISCAYNE|CUTLER BAY|PALMETTO BAY|AVENTURA|FLORIDA CITY|EL PORTAL|BISCAYNE PARK|GOLDEN BEACH|SURFSIDE|BAL HARBOUR|BAY HARBOR ISLANDS|SUNNY ISLES BEACH)$/;
const text = value => typeof value === 'string' ? value.trim() : '';
const positive = value => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const money = value => value.toLocaleString('en-US', {style:'currency',currency:'USD',maximumFractionDigits:0});

function addressQuery(input) {
  const value = text(input).toUpperCase().normalize('NFKC');
  if (value.length > 140 || !/^\d+[ A-Z0-9#.,'-]+$/.test(value)) return null;
  const zip = value.match(/\s(\d{5})(?:-\d{4})?$/)?.[1] || null;
  // A comma before a city is conventional; commas before unit or directional details aren't necessary.
  const parts=value.replace(/,\s*(?:APT|UNIT|SUITE|STE|#)\s*/g, ' UNIT ').split(',');
  let street = parts[0].trim().replace(/\s+\d{5}(?:-\d{4})?$/, '').replace(/\s+(FL|FLORIDA)$/, '');
  const location = parts.length>1 ? ' '+parts.slice(1).join(' ').trim().replace(/\s+\d{5}(?:-\d{4})?$/, '').replace(/\s+(FL|FLORIDA)$/, '').trim() : street;
  const town = location.match(cities)?.[0].trim() || null;
  street = street.replace(cities, '');
  const unitMatch = street.match(/(?:\s+(?:APT|UNIT|SUITE|STE)\s*|\s*#\s*)([A-Z\d-]+)$/);
  if (unitMatch) street = street.slice(0, unitMatch.index).trim();
  if (/[^A-Z0-9 .'-]/.test(street)) return null;
  const clean = street.replaceAll('.', '').replace(/\b(\d+)(ST|ND|RD|TH)\b/g, '$1')
    .replace(/\b(NORTH|SOUTH)\s+(EAST|WEST)\b/g, (_, a,b)=>a[0]+b[0])
    .split(/\s+/).map(word => suffixes[word] || word).join(' ');
  if (!/^\d+[A-Z]?(?:-\d+)?\s+[A-Z\d][A-Z\d '\-]{1,85}$/.test(clean) || !/[A-Z]{2}/.test(clean)) return null;
  const addresses = [clean];
  if (clean.endsWith(' AVE')) addresses.push(clean.slice(0,-1));
  if (clean.endsWith(' TER')) addresses.push(clean+'R');
  const quote = token => "'" + token.replaceAll("'", "''") + "'";
  let where = 'TRUE_SITE_ADDR_NO_UNIT IN (' + addresses.map(quote).join(',') + ')';
  if (unitMatch) where += ' AND TRUE_SITE_UNIT = ' + quote(unitMatch[1]);
  if (zip) where += " AND TRUE_SITE_ZIP_CODE LIKE '" + zip + "%'";
  if (town && town!=='MIAMI') where += ' AND TRUE_SITE_CITY = '+quote(town);
  return where;
}

function titleCase(value) {
  return text(value).toLowerCase().replace(/\b[a-z]/g,c=>c.toUpperCase()).replace(/\b(Nw|Sw|Ne|Se)\b/g,c=>c.toUpperCase());
}

function parcelUrl(folio) {
  return countyViewer+'#/?folio='+folio;
}

export function mapCountyFeature(feature) {
  const a=feature.attributes || {};
  if (!/^\d{13}$/.test(a.FOLIO) || !/^\d+\s*\w/.test(text(a.TRUE_SITE_ADDR_NO_UNIT)) || /CONFIDENTIAL|WITHHELD|REDACTED|RESTRICTED|EXEMPT/i.test(a.TRUE_SITE_ADDR_NO_UNIT)) return null;
  const town = text(a.TRUE_SITE_CITY);
  const coords = feature.geometry || {};
  const lat = coords.y >= 25 && coords.y <= 26.2 && coords.x >= -81.1 && coords.x <= -80 ? coords.y : null;
  const year = positive(a.YEAR_BUILT);
  const baths = positive(a.BATHROOM_COUNT);
  const half = positive(a.HALF_BATHROOM_COUNT);
  const row = {
    id:'county-'+a.FOLIO, address:titleCase(a.TRUE_SITE_ADDR || a.TRUE_SITE_ADDR_NO_UNIT),
    city:town === 'UNINCORPORATED COUNTY' ? 'Unincorporated Miami-Dade' : titleCase(town), state:'FL',
    zip:text(a.TRUE_SITE_ZIP_CODE).slice(0,5), mls:'',price:null,priceLabel:'County property record',
    date:'',beds:positive(a.BEDROOM_COUNT),baths:baths, sqft:positive(a.BUILDING_HEATED_AREA),year,
    lat, lng:lat===null ? null : coords.x, withheld:false, county:true,folio:a.FOLIO,detailUrl:null,
  };
  const facts = [];
  function add(label,value) { if (value !== null && value !== undefined && value !== '') facts.push({label,value:String(value)}); }
  add('Property folio',a.FOLIO);
  add('County land use',a.DOR_DESC);
  add('Municipality',row.city);
  add('Year built',year);
  add('Bedrooms',row.beds);
  add('County bath count',baths);
  add('Half baths (county field)',half);
  add('Stories',positive(a.FLOOR_COUNT));
  for (const [label,field] of [['Heated area','BUILDING_HEATED_AREA'],['Actual building area','BUILDING_ACTUAL_AREA'],['Adjusted building area','BUILDING_EFFECTIVE_AREA'],['Lot area','LOT_SIZE']]) {
    const area=positive(a[field]); if (area) add(label,area.toLocaleString('en-US')+' sq ft');
  }
  const assessed = [];
  for(const period of ['CUR','PRI']) {
    const y = positive(a['ASSESSMENT_YEAR_'+period]);
    const v = positive(a['ASSESSED_VAL_'+period]);
    if(y && v) {
      add('Assessed value · '+y, money(v));
      assessed.push({year:y,assessed:v,tax:null});
    }
  }
  const priceHistory=[];
  for(let n=1;n<=3;n++) {
    const raw=text(a['DOS_'+n]);
    const amount=positive(a['PRICE_'+n]);
    if (/^(19|20)\d{2}(0[1-9]|1[012])([012]\d|3[01])$/.test(raw) && amount) {
      priceHistory.push({date:raw.slice(0,4)+'-'+raw.slice(4,6)+'-'+raw.slice(6,8),label:'County-recorded transfer',price:amount,source:countySource});
    }
  }
  const links = [{label:'County property record',url:parcelUrl(a.FOLIO)},{label:'County parcel data source',url:layer}];
  if (lat!==null) {
    links.push({label:'Nearby street view on Google Maps',url:'https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+encodeURIComponent(lat.toFixed(6)+','+row.lng.toFixed(6))});
  }
  const media = countyMedia(row);
  const detail = {...row, facts,observations:[],priceHistory,taxHistory:assessed,sections:[],links,media};
  return {row,detail};
}

export function countyMedia(row) {
  const {lat,lng}=row;
  if (!row.county || !Number.isFinite(lat) || !Number.isFinite(lng) || lat<25 || lat>26.2 || lng<-81.1 || lng>-80) return [];
  const dx=0.00065*1.5/Math.cos(lat*Math.PI/180);
  const box=[lng-dx,lat-0.00065,lng+dx,lat+0.00065].map(v=>v.toFixed(7)).join(',');
  const options=new URLSearchParams({bbox:box,bboxSR:'4326',imageSR:'3857',size:'720,480',format:'jpg',f:'image'});
  const sourceImageUrl=imageryService+'/export?'+options;
  const image={type:'aerial',url:sourceImageUrl,sourceImageUrl,alt:'County aerial photograph centered on the parcel for '+row.address,
    credit:'Miami-Dade County GIS',sourceUrl:imageryService,license:'County aerial map service',date:''};
  if(row.detailShard && !row.supplemental){
    const x=6378137*lng*Math.PI/180;
    const y=6378137*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360));
    const gx=Math.floor(x/1024),gy=Math.floor(y/1024);
    image.url='/buggy/media/county-tiles/'+gx+'_'+gy+'.webp';
    image.crop={x:(x-gx*1024+128)/1280,y:((gy+1)*1024+128-y)/1280,scale:1280/216};
  }
  return [image];
}

async function query(where,signal) {
  const options=new URLSearchParams({f:'json',where:'('+where+') AND '+publicResidential,outFields:fields.join(','),
    returnGeometry:'true',outSR:'4326',resultRecordCount:'25',orderByFields:'FOLIO'});
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) throw new DOMException('Search cancelled','AbortError');
  signal?.addEventListener('abort',abort,{once:true});
  const timeout=setTimeout(abort,20000);
  try {
    const response=await fetch(layer+'/query?'+options,{credentials:'omit',signal:controller.signal});
    if(!response.ok) throw new Error('County records are temporarily unavailable.');
    const result=await response.json();
    if(result.error || !Array.isArray(result.features)) throw new Error('County records are temporarily unavailable.');
    const matched=new Map();
    for(const feature of result.features) {
      const entry=mapCountyFeature(feature);
      if(!entry) continue;
      matched.set(entry.row.id,entry.row);
      cache.set(entry.row.id,entry.detail);
      if(cache.size>100) cache.delete(cache.keys().next().value);
    }
    return [...matched.values()];
  } catch(error) {
    if(signal?.aborted) throw new DOMException('Search cancelled','AbortError');
    throw new Error('County records are temporarily unavailable.',{cause:error});
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort',abort);
  }
}

export async function searchCounty(input,{signal}={}) {
  const where=addressQuery(input);
  return where ? query(where,signal) : [];
}

export async function getCountyDetail(id,{signal}={}) {
  const match=typeof id==='string' && /^county-(\d{13})$/.exec(id);
  if(!match) return null;
  if(cache.has(id)) return cache.get(id);
  await query("FOLIO = '"+match[1]+"'",signal);
  return cache.get(id) || null;
}
