'use strict';
const byId = id => document.getElementById(id);
const cash = new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0});
const pageSize = 25;
let homes = [], filtered = [], page = 0, slide = 0, active = null;
const slideTitles = ['Sample overview','Asking prices','Field coverage','Two later sales','Source and selection'];
function element(tag, label, className) {
  const node = document.createElement(tag);
  if (label !== undefined) node.textContent = label;
  if (className) node.className = className;
  return node;
}
function drawList() {
  const rows = byId('rows');
  rows.replaceChildren();
  const start = page * pageSize, end = Math.min(filtered.length, start + pageSize);
  byId('count').textContent = filtered.length ? (start+1)+'–'+end+' of '+filtered.length.toLocaleString()+' homes' : 'No matching homes';
  byId('page').textContent = filtered.length ? 'Page '+(page+1)+' of '+Math.ceil(filtered.length/pageSize) : '';
  byId('prev').disabled = page===0; byId('next').disabled = end>=filtered.length;
  for (const h of filtered.slice(start,end)) {
    const tr = element('tr'), address = element('td'), pick = element('button',h.street_address,'street');
    pick.addEventListener('click',()=>showHome(h));
    address.append(pick,element('small','Miami, FL '+h.zip_code));
    tr.append(address,...[cash.format(h.asking_price_usd),h.bedrooms,h.bathrooms,h.year_built].map(t=>element('td',t||'—')));
    rows.append(tr);
  }
}
function applyFilters() {
  const query = byId('search').value.toLowerCase().trim();
  filtered = homes.filter(h => (h.street_address+' Miami FL '+h.zip_code+' '+h.zpid).toLowerCase().includes(query));
  const sort = byId('sort').value;
  if(sort!=='source') filtered.sort((a,b)=>(sort==='low'?1:-1)*(Number(a.asking_price_usd)-Number(b.asking_price_usd)));
  page=0;drawList();
}
function fieldLabel(key) {return (key[0].toUpperCase()+key.slice(1)).replaceAll('_',' ').replace(/usd/gi,'USD').replace(/sqft/gi,'sq ft');}
function formatValue(key,v) {
  if(v==='') return '—';
  if(key.includes('_usd')) return cash.format(v);
  return v;
}
async function showHome(h) {
  active=h.zpid;
  const body=byId('detailsBody'), link=element('a','Open original Zillow listing ↗');
  link.href=h.zillow_url;link.target='_blank';link.rel='noopener';
  const dl=element('dl');
  for (const [key,value] of Object.entries(h)) {
    if (['group','zillow_url','property_profile','street_address'].includes(key)) continue;
    dl.append(element('dt',key==='zpid'?'Zillow ID':fieldLabel(key)),element('dd',formatValue(key,value)));
  }
  const more=element('details'), pre=element('pre','Loading the full record…');
  more.append(element('summary','Full record, including histories and property details'),pre);
  body.replaceChildren(element('h2',h.street_address),element('p',h.property_profile),link,dl,more);
  byId('detail').showModal();byId('detail').scrollTop=0;
  try {
    const res=await fetch('records/'+h.group+'.json.gz');
    if(!res.ok) throw Error();
    const bytes=new Uint8Array(await res.arrayBuffer());
    const content=bytes[0]===0x1f && bytes[1]===0x8b
      ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
      : new TextDecoder().decode(bytes);
    const data=JSON.parse(content).find(r=>String(r.zpid)===h.zpid);
    if(!data) throw Error();
    if(active===h.zpid) pre.textContent=JSON.stringify(data,null,2);
  } catch { pre.textContent='The full record could not load. The complete repository ZIP includes this house.'; }
}
function drawSlide() {
  byId('slide').src='slides/slide-'+(slide+1)+'.png';
  byId('slide').alt=slideTitles[slide]+'. Full slide text is available below.';
  byId('caption').textContent=(slide+1)+' of 5 · '+slideTitles[slide];
  byId('back').disabled=slide===0;byId('forward').disabled=slide===4;
}
byId('search').addEventListener('input',applyFilters);
byId('sort').addEventListener('change',applyFilters);
byId('prev').onclick=()=>{page--;drawList()};
byId('next').onclick=()=>{page++;drawList()};
byId('back').onclick=()=>{slide--;drawSlide()};
byId('forward').onclick=()=>{slide++;drawSlide()};
byId('close').onclick=()=>byId('detail').close();
byId('detail').addEventListener('click',ev=>{if(ev.target===byId('detail')) {const r=ev.target.getBoundingClientRect();if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)ev.target.close();}});
fetch('houses.json').then(r=>{if(!r.ok)throw Error();return r.json()}).then(v=>{homes=v;applyFilters()}).catch(()=>{byId('count').textContent='The list could not load. The spreadsheet is available below.';});
