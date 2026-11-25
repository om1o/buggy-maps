import { hasListingTour } from './listing-tour.js';
// Property search uses only fields present in the local, dated records.
const aliases = {
  north:'n', south:'s', east:'e', west:'w', northeast:'ne', northwest:'nw', southeast:'se', southwest:'sw',
  street:'st', avenue:'ave', av:'ave', terrace:'ter', terr:'ter', court:'ct', drive:'dr', road:'rd', place:'pl',
  circle:'cir', lane:'ln', boulevard:'blvd', highway:'hwy', parkway:'pkwy', trail:'trl', florida:'fl',
  suite:'unit', apartment:'unit', apt:'unit', apartamento:'unit', unidad:'unit', apto:'unit', condominium:'condo',
};

export function normalize(value) {
  return String(value || '').replace(/#\s*([a-z\d]+)/ig,' unit $1').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/\b(north|south)\s+(east|west)\b/g,(_,a,b)=>a[0]+b[0])
    .replace(/\b([ns])[\s.]+([ew])\b/g,'$1$2').replace(/[^a-z0-9]+/g,' ').trim()
    .split(/\s+/).map(word => aliases[word] || word.replace(/^(\d+)(?:st|nd|rd|th)$/,'$1')).join(' ');
}

const stripWords = new Set('a an and any all at by find for from home homes house houses in me my near nearby of please properties property records show single family the that with within zip zipcode code neighborhood neighbourhood subdivision community building en con del las los'.split(' '));
const addressSuffix = /\b(st|ave|ter|ct|dr|rd|pl|cir|ln|blvd|hwy|pkwy|trl|way|row|walk|loop|plaza)\b/;
const searchWords = /\b(beds?|bedrooms?|br|baths?|bathrooms?|ba|sqft|square feet|drone|aerial|front|exterior|photos?|pictures?|sold|under|over|between|minimum|maximum)\b/i;

function isStreetQuery(value) {
  const line = normalize(value);
  if (!/^\d+[a-z]?\s+/.test(line)) return false;
  if (/^33\d{3}(?: (?:miami|fl|usa))+$/.test(line)) return false;
  const hasStreetSuffix=addressSuffix.test(line);
  if (searchWords.test(value) && (!hasStreetSuffix || /^\d+[a-z]? (?:beds?|bedrooms?|br|baths?|bathrooms?|ba)\b/.test(line))) return false;
  if (/\b(?:homes|properties|houses)\b/i.test(value) && !addressSuffix.test(line)) return false;
  return addressSuffix.test(line) || /^\d+[a-z]? (?:ne|nw|se|sw|n|s|e|w) [a-z\d]/.test(line) ||
    /^\d+[a-z]? [a-z]{3,}(?: [a-z]{2,})?(?:,|$)/.test(String(value).trim().toLowerCase());
}

export function countyAddress(value) {
  const typed=String(value || '').trim();
  const target=typed.match(/^(?:(?:homes|houses|properties)\s+)?near(?:by)?\s+(.+)$/i)?.[1] || typed;
  return isStreetQuery(target) ? target : '';
}

export const wantsCounty = value => Boolean(countyAddress(value));

const tokens = value => normalize(value).split(' ').filter(Boolean);
const groveNeighborhoods = new Set(['South Grove','East Grove','North Grove','West Grove','South Grove Bayside','Bird Grove East','Bird Grove West','Grove Center']);
const namedPlaces = new Map();
const localityTokens = new Map();

function names(items,label) {
  return (items || []).filter(name=>typeof name==='string' && name.trim()).map(name=>{
    const key=label+'|'+name;
    let place=namedPlaces.get(key);
    if(!place) {
      const words=tokens(name);
      if(label==='Neighborhood' && groveNeighborhoods.has(name)) words.push('coconut');
      place={name,label,words};
      namedPlaces.set(key,place);
    }
    return place;
  });
}

export function indexRow(row, places={}) {
  const addresses=[...new Set([row.address,...(row.searchAddresses || [])].filter(Boolean).map(normalize))];
  const zips=[...new Set([row.zip,...(row.searchZips || [])].filter(Boolean).map(String))];
  const localityKey=[row.city,row.state,...zips].join('|');
  let locality=localityTokens.get(localityKey);
  if(!locality) {
    const city=normalize(row.city);
    const location=tokens([city,row.state].filter(Boolean).join(' '));
    locality={city, location, address:[...location,...zips,'united','states','usa']};
    localityTokens.set(localityKey,locality);
  }
  const id=normalize(row.id), mls=normalize(row.mls);
  const matchWords=[...addresses,...locality.location,...zips,mls,id,row.folio].filter(Boolean).join(' ').split(/\s+/);
  return Object.assign(row,{
    _line:addresses[0] || '', _lines:addresses, _zips:zips, _mlsKey:mls,
    _idKey:id, _cityKey:locality.city, _tokens:[...new Set(matchWords)],
    _locality:locality.location, _addressLocality:locality.address,
    _places:[...names(places.neighborhoods,'Neighborhood'),...names(places.subdivisions,'Subdivision')],
    _schools:names(places.schools,'Nearby school'),
  });
}

export function exactStreet(row,value) {
  const line=normalize(countyAddress(value) || value);
  return row._lines.some(address=>{
    if(line===address)return true;
    return line.startsWith(address+' ') && line.slice(address.length+1).split(' ').every(part=>row._addressLocality.includes(part));
  });
}

const priceNumber = '(?:\\$\\s*)?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?\\s*(?:thousand|million|[km](?![a-z]))?';
const countNumber = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const cmpWords = '(?:no more than|no less than|at least|at most|up to|less than|more than|under|below|over|above|minimum|maximum)';
const units = '(?:bedrooms?|beds?|br|bathrooms?|baths?|ba|square feet|sq\\.?\\s*ft\\.?|sqft)';
const countField = unit => /^(?:br|bed)/i.test(unit) ? 'beds' : /^(?:ba)/i.test(unit) ? 'baths' : 'sqft';

function magnitude(raw) {
  const plain=raw.replace(/[$,\s]+/g,'').toLowerCase();
  const multiplier=/(?:m|million)$/.test(plain)?1e6:/(?:k|thousand)$/.test(plain)?1e3:1;
  return parseFloat(plain) * multiplier;
}

function operator(word,plus) {
  if (plus || /^(at least|no less than|minimum)$/.test(word)) return 'min';
  if (/^(at most|no more than|up to|maximum)$/.test(word)) return 'max';
  if (/^(less than|under|below)$/.test(word)) return 'lt';
  if (/^(over|above|more than)$/.test(word)) return 'gt';
  return 'eq';
}

// Translate query syntax only. Keep official school, subdivision and street names intact.
const spanishPhrases=[
  [/\bc[oó]digo postal\b/g,'zip'], [/\bcerca de(?: la)?\b/g,'near'],
  [/\b(?:por lo menos|al menos|como m[ií]nimo)\b/g,'at least'],
  [/\b(?:como m[aá]ximo|hasta)\b/g,'up to'],
  [/\bmenos de\b/g,'under'], [/\bm[aá]s de\b/g,'over'],
  [/\bpies cuadrados\b/g,'sq ft'], [/\ben venta\b/g,'for sale'],
  [/\b(?:fotos|im[aá]genes)(?: de| del)? dron\b/g,'drone photos'],
  [/\bgaler[ií]as?(?: de fotos)?\b/g,'galleries'],
  [/\b(?:fotos|im[aá]genes) a[eé]reas\b/g,'aerial photos'],
  [/\b(?:fotos|im[aá]genes) (?:del |de )?(?:fachadas?|exteriores?)\b/g,'exterior photos'],
];
const spanishWords={
  casas:'homes',casa:'house',viviendas:'homes',vivienda:'home',propiedades:'properties',propiedad:'property',
  habitaciones:'beds',dormitorios:'beds',habitacion:'bed',dormitorio:'bed',recamaras:'beds',
  banos:'baths',bano:'bath',fotos:'photos',imagenes:'photos',aereas:'aerial',dron:'drone',vendidas:'sold',
  vendida:'sold',barrio:'neighborhood',urbanizacion:'subdivision',edificio:'building',condominio:'condo',
  escuela:'school',colegio:'school',escuelas:'school',primaria:'elementary',intermedia:'middle',
  cerca:'near',con:'with',entre:'between',menos:'under',todas:'all',todos:'all',tres:'three',dos:'two',
  cuatro:'four',cinco:'five',seis:'six',siete:'seven',ocho:'eight',nueve:'nine',diez:'ten',
};
function querySyntax(value) {
  let text=value;
  for(const [pattern,replacement] of spanishPhrases) text=text.replace(pattern,replacement);
  return text.replace(/[\p{L}]+/gu,word=>spanishWords[word.normalize('NFD').replace(/[\u0300-\u036f]/g,'')] || word);
}

export function parseSearch(input) {
  const inputText=String(input || '').trim().toLowerCase();
  const numericRoomQuery=/^\d[\d.,]*\s*(?:dormitorios?|habitaci[oó]n(?:es)?|baños?)\b/.test(inputText);
  const raw=countyAddress(inputText)&&!numericRoomQuery?inputText:querySyntax(inputText);
  const nearby=/\bnear(?:by)?\b/.test(raw);
  const streetText=countyAddress(raw);
  const plan={text:raw, normalized:normalize(streetText || raw), street:Boolean(streetText), words:[], limits:[], media:[], zips:[], event:'',school:false,nearby,city:'',placeType:'',all:false};
  if (plan.street) {
    plan.words=tokens(streetText);
    return plan;
  }
  let rest=raw.replace(/[-‐‑–](?=bedroom|bathroom|bed\b|bath\b)/g,' ');
  const numbers={one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10};
  rest=rest.replace(/\b(one|two|three|four|five|six|seven|eight|nine|ten)(?=\s+(?:bed|bath))/g,word=>numbers[word]);
  function bound(key,op,val){plan.limits.push({key,op,value:magnitude(val)});}
  const roomRange=new RegExp('\\b(?:between\\s+)?('+countNumber+')\\s*(?:and|to|[-–])\\s*('+countNumber+')\\s*('+units+')\\b','g');
  rest=rest.replace(roomRange,(_,lo,hi,unit)=>{bound(countField(unit),'min',lo);bound(countField(unit),'max',hi);return ' ';});
  const room=new RegExp('(?:\\b('+cmpWords+')\\s*)?('+countNumber+')\\s*(\\+)?\\s*('+units+')\\b(?:\\s+(or more|or fewer|or less))?','g');
  rest=rest.replace(room,(_,word,amount,plus,unit,after)=>{
    const op=after==='or more'?'min':after?'max':operator(word,plus);
    bound(countField(unit),op,amount); return ' ';
  });
  const priceRange=new RegExp('(?:\\bbetween\\s+)?('+priceNumber+')\\s*(?:to|and|[-–])\\s*('+priceNumber+')(?=\\s|$|[.,])','g');
  rest=rest.replace(priceRange,(_,lo,hi)=>{bound('price','min',lo);bound('price','max',hi);return ' ';});
  const priceLimit=new RegExp('\\b('+cmpWords+')\\s+('+priceNumber+')','g');
  rest=rest.replace(priceLimit,(_,word,amount)=>{bound('price',operator(word),amount);return ' ';});
  const exactPrice=new RegExp('\\$\\s*('+priceNumber+')','g');
  rest=rest.replace(exactPrice,(_,amount)=>{bound('price','eq',amount);return ' ';});
  rest=rest.replace(/\b(?:sold|recorded sales?|closed sales?)\b/g,()=>{plan.event='sold';return ' ';});
  rest=rest.replace(/\b(?:asking prices?|asking|for sale|list(?:ed)? price)\b/g,()=>{plan.event ||= 'ask';return ' ';});
  const pictures=/\b(?:photos?|photographs?|pictures?|images?)\b/.test(rest);
  rest=rest.replace(/\bdrone\b/g,()=>{plan.media.push('drone');return ' ';});
  rest=rest.replace(/\bfront(?:\s+(?:exteriors?|outside))?\b/g,()=>{plan.media.push(pictures?'frontPhoto':'front');return ' ';});
  rest=rest.replace(/\b(?:exteriors?|outside)\b/g,()=>{plan.media.push(pictures?'exteriorPhoto':'exterior');return ' ';});
  rest=rest.replace(/\b(?:aerial|overhead)\b/g,()=>{plan.media.push('aerial');return ' ';});
  if(/\bgaller(?:y|ies)\b/.test(rest) && !plan.media.length) plan.media.push('gallery');
  if(pictures && !plan.media.length) plan.media.push('photo');
  if(plan.media.length) rest=rest.replace(/\b(?:photos?|photographs?|pictures?|images?|views?|galler(?:y|ies))\b/g,' ');
  const bareHouseNumber=/^\d{5}$/.test(raw) && !raw.startsWith('33');
  if(!bareHouseNumber) rest=rest.replace(/\b\d{5}\b/g,zip=>{plan.zips.push(zip);return ' ';});
  rest=rest.replace(/\bin miami(?:[ ,]+(?:fl|florida))?\s*$/i,()=>{plan.city='miami';return ' ';});
  rest=rest.replace(/\b(?:mls(?:\s+(?:number|id))?|zillow\s+id)\s*[:#]?\s*(?=[a-z]*\d)/g,' ');
  if(/\bneighbou?rhood\b/.test(rest)) plan.placeType='Neighborhood';
  if(/\b(?:subdivision|building)\b/.test(rest)) plan.placeType='Subdivision';
  plan.school=/\b(?:school|elementary|academy)\b|\b(?:middle|high)\s*$/i.test(rest);
  plan.all=/\b(homes?|houses?|propert(?:y|ies)|records|all)\b/.test(rest);
  plan.words=tokens(rest).filter(word=>!stripWords.has(word));
  return plan;
}

function passesLimit(value,limit) {
  if (!Number.isFinite(value) || (limit.key==='price' && value<=0)) return false;
  if (limit.op==='min') return value>=limit.value;
  if (limit.op==='max') return value<=limit.value;
  if (limit.op==='lt') return value<limit.value;
  if (limit.op==='gt') return value>limit.value;
  return value===limit.value;
}

export function hasPhotoGallery(row,media) {
  if(hasListingTour(row.id)) return true;
  const stills=(media[row.id] || []).filter(item=>!item.publisher);
  return stills.some(item=>item.type!=='aerial') && (stills.length>1 || row.county && Number.isFinite(row.lat) && Number.isFinite(row.lng) && stills.every(item=>item.type!=='aerial'));
}

function mediaMatch(row,kind,media) {
  if(kind==='gallery') return hasPhotoGallery(row,media);
  if(kind==='drone') return Number(row.dronePhotoCount)>0;
  if((kind==='aerial' || kind==='photo') && row.county && Number.isFinite(row.lat) && Number.isFinite(row.lng) && row.lat>=25 && row.lat<=26.2 && row.lng>=-81.1 && row.lng<=-80)return true;
  return (media[row.id] || []).some(item=>{
    if(kind==='front') return item.type==='front';
    if(kind==='exterior') return ['front','exterior'].includes(item.type);
    if(item.publisher) return false;
    if(kind==='frontPhoto') return item.type==='front';
    if(kind==='exteriorPhoto') return ['front','exterior'].includes(item.type);
    if(kind==='aerial') return item.type==='aerial';
    return Boolean(item.url);
  });
}

function tokenScore(words,tokens,partial) {
  let rank=0;
  for(const word of words) {
    if(tokens.includes(word)) rank+=4;
    else if ((word.length>=2 && !/^\d+$/.test(word) || partial && word.length>=2) && tokens.some(t=>t.startsWith(word))) rank+=1;
    else return -1;
  }
  return rank;
}

function matchedNames(row,plan,committed) {
  if(!plan.words.length || !plan.school && !plan.placeType && plan.words.every(w=>row._locality.includes(w))) return [];
  const options=plan.school?row._schools:plan.nearby?[...row._places,...row._schools]:row._places;
  return options.flatMap(item=>{
    if(plan.placeType && item.label!==plan.placeType) return [];
    if(!plan.words.some(word=>item.words.some(token=>token.startsWith(word)))) return [];
    const rank=tokenScore(plan.words,item.words,!committed);
    return rank>=0?[{name:item.name,label:item.label,rank}]:[];
  });
}

export function placeMatchLabel(row,plan) {
  if(!row._places || plan.street || !plan.words.length) return '';
  const [best]=matchedNames(row,plan,true).sort((a,b)=>b.rank-a.rank);
  return best ? best.label+' · '+best.name : '';
}

function score(row,plan,committed) {
  const norm=plan.normalized;
  if(plan.street) {
    let best=-1;
    for(const line of row._lines){
      const parts=line.split(' ');
      if(committed && parts[0]!==plan.words[0])continue;
      if(committed && plan.words.slice(1).some(w=>/^\d+$/.test(w) && !row._zips.includes(w) && !parts.includes(w)))continue;
      const base=tokenScore(plan.words,[...parts,...row._addressLocality],!committed);
      if(base<0)continue;
      const exact=line===norm?500:exactStreet(row,plan.normalized)?350:0;
      best=Math.max(best,base+exact+(line.startsWith(norm+' ')?100:0)+(parts[0]===plan.words[0]?30:0));
    }
    return best;
  }
  if(!plan.words.length) return 0;
  const withPlace=Math.max(-1,...matchedNames(row,plan,committed).map(item=>item.rank));
  if(plan.school || plan.placeType) return withPlace;
  const base=tokenScore(plan.words,row._tokens,!committed);
  if(base<0 && withPlace<0) return -1;
  if(norm===row._mlsKey || norm===row._line || norm===row._idKey)return Math.max(0,base)+500;
  return Math.max(base>=0?base+2:-1,withPlace);
}

// A complete address can outrank a longer house number. Another matching unit,
// directional variant, or duplicate address still needs an explicit choice.
export function unambiguousHome(rows,text) {
  if(rows.length<=1)return rows[0];
  const plan=parseSearch(text);
  if(!plan.street)return null;
  const exact=rows.find(row=>exactStreet(row,text));
  if(!exact || rows.some(row=>row!==exact && score(row,plan,true)>=0))return null;
  return exact;
}

export function findProperties(rows,media,term,committed=false) {
  const plan=typeof term==='string'?parseSearch(term):term;
  if(!plan.text || !plan.all && !plan.words.length && !plan.zips.length && !plan.media.length && !plan.limits.length && !plan.event && !plan.city) return [];
  const wantsPrice=plan.limits.some(limit=>limit.key==='price');
  return rows.map(row=>{
    if(plan.zips.length && !plan.zips.some(zip=>row._zips.includes(zip))) return null;
    if(plan.city && row._cityKey!==plan.city) return null;
    if(plan.limits.some(limit=>!passesLimit(row[limit.key],limit)))return null;
    if(plan.media.some(kind=>!mediaMatch(row,kind,media))) return null;
    if(plan.event==='sold' && !/sale/i.test(row.priceLabel)) return null;
    if((plan.event==='ask' || wantsPrice && plan.event!=='sold') && !/ask/i.test(row.priceLabel)) return null;
    const rank=score(row,plan,committed);
    return rank>=0?{row,rank}:null;
  }).filter(Boolean).sort((a,b)=>b.rank-a.rank).map(item=>item.row);
}

export function priceSearchNote(plan) {
  if(plan.limits.some(limit=>limit.key==='price') || plan.event) {
    return plan.event==='sold'?'Prices are recorded sales at the dates shown.':'Asking prices reflect their recorded dates.';
  }
  if(plan.school) return 'Schools are those listed nearby in the archive.';
  if(plan.nearby) return 'Matches use indexed addresses, place names and nearby schools.';
  return '';
}
