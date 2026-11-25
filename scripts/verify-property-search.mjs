// Run against the production-shaped source files so counts cannot drift behind hardcoded fixtures.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { indexRow, findProperties, wantsCounty, countyAddress, exactStreet, parseSearch, placeMatchLabel } from '../dist/buggy/search.js';
const data=process.argv[2] || path.join(import.meta.dirname, '../dist/buggy/data');
const load=name=>JSON.parse(fs.readFileSync(path.join(data,name),'utf8'));
const original=load('index.json'),media=load('media.json'),places=load('search-places.json');
const rows=original.map(r=>indexRow({...r},places[r.id]));
const ask=r=>/ask/i.test(r.priceLabel)&&r.price>0;
const sale=r=>/sale/i.test(r.priceLabel)&&r.price>0;
const hasZip=(r,zip)=>[r.zip,...(r.searchZips||[])].includes(zip);
const addresses=r=>[r.address,...(r.searchAddresses||[])];
const countyAerial=r=>r.county&&Number.isFinite(r.lat)&&Number.isFinite(r.lng)&&r.lat>=25&&r.lat<=26.2&&r.lng>=-81.1&&r.lng<=-80;
const hasName=(r,words)=>[...addresses(r),...Object.values(places[r.id]||{}).flat()].some(n=>words.every(w=>new RegExp('\\b'+w+'\\b','i').test(n)));
const match=(query,expected)=>{
  const actual=findProperties(rows,media,query,true);
  assert.deepEqual(actual.map(r=>r.id).sort(),original.filter(expected).map(r=>r.id).sort(),query);
  return actual;
};
const examples=[
 ['3 beds in 33135',r=>r.beds===3&&hasZip(r,'33135')],
 ['three-bedroom homes in 33135',r=>r.beds===3&&hasZip(r,'33135')],
 ['homes with drone photos',r=>r.dronePhotoCount>0],
 ['front exterior photos',r=>media[r.id]?.some(i=>i.type==='front'&&!i.publisher)],
 ['exterior views',r=>media[r.id]?.some(i=>['front','exterior'].includes(i.type))],
 ['aerial photos',r=>countyAerial(r)||media[r.id]?.some(i=>i.type==='aerial'&&!i.publisher)],
 ['homes under $800k',r=>ask(r)&&r.price<800000],
 ['asking price up to $800,000',r=>ask(r)&&r.price<=800000],
 ['3+ beds and 2 baths under $1.2 million in 33135',r=>r.beds>=3&&r.baths===2&&hasZip(r,'33135')&&ask(r)&&r.price<1200000],
 ['sold under $800k',r=>sale(r)&&r.price<800000],
 ['between $500,000 and $775k',r=>ask(r)&&r.price>=500000&&r.price<=775000],
 ['homes with at least 2000 sq ft',r=>r.sqft>=2000],
 ['2 to 3 bedrooms',r=>r.beds>=2&&r.beds<=3],
 ['4 bedroom homes in 00000',()=>false],
 ['$0',()=>false],['homes under $400',()=>false],
 ['near Shenandoah Middle School',r=>places[r.id]?.schools.includes('Shenandoah Middle School')],
 ['near Shenandoah Middle',r=>places[r.id]?.schools.includes('Shenandoah Middle School')],
 ['Shenandoah Middle',r=>places[r.id]?.schools.includes('Shenandoah Middle School')],
 ['near Ponce de Leon',r=>hasName(r,['ponce','de','leon'])],
 ['nearby Ponce de Leon in 33135',r=>hasZip(r,'33135')&&hasName(r,['ponce','de','leon'])],
 ['near Miami High',r=>places[r.id]?.schools.some(name=>/\bMiami\b/i.test(name)&&/\bHigh\b/i.test(name))],
 ['near 33135 Miami FL',r=>hasZip(r,'33135')],
 ['near 15264 Southwest 102nd Court',r=>r.id==='zillow-44298025'],
 ['near Southwest 22nd Terrace',r=>addresses(r).some(address=>/\bsw 22(?:nd)? ter(?:r(?:ace)?)?\b/i.test(address))],
 ['Brickell Estates subdivision',r=>places[r.id]?.subdivisions.some(n=>/\bBrickell\b/i.test(n)&&/\bEstates/i.test(n))],
 ['MLS A12098257',r=>r.mls==='A12098257'],
 ['44205211',r=>r.id==='zillow-44205211'],['33135',r=>hasZip(r,'33135')],
 ['5550 south west 87th avenue Miami Florida 33165',r=>r.id==='zillow-44205211'],
 ['15264',r=>addresses(r).some(address=>address.startsWith('15264 '))],
 ['1830 SW 22nd Terrace, Miami',r=>addresses(r).some(address=>/^1830\s+SW\s+22(?:nd)?\s+Ter(?:r(?:ace)?)?$/i.test(address))],
 ['Nonexistent municipality and no archive record',()=>false],
];
for(const [text,predicate] of examples)console.log(text,match(text,predicate).length);
const neighborhoodTerm='Brickell neighborhood';
const mapped=original.filter(r=>places[r.id]?.neighborhoods.some(n=>/\bBrickell\b/i.test(n)));
if(mapped.length)console.log(neighborhoodTerm,match(neighborhoodTerm,r=>mapped.includes(r)).length);
const query='near Shenandoah Middle School';const found=findProperties(rows,media,query,true);
assert.ok(found.length && found.every(r=>placeMatchLabel(r,parseSearch(query))==='Nearby school · Shenandoah Middle School'));
assert.ok(wantsCounty('1830 SW 22nd Terrace, Miami'));
assert.equal(countyAddress('homes near 1830 SW 22nd Terrace, Miami'),'1830 SW 22nd Terrace, Miami');
assert.equal(countyAddress('near 33135 Miami FL'),'');
for(const term of ['3 bedrooms in 33135','33135','99 bedroom homes','homes under $800k','A12098257'])assert.equal(wantsCounty(term),false,term);
const exact=rows.find(r=>r.id==='zillow-44205211');
assert.ok(exactStreet(exact,'5550 Southwest 87th Avenue, Miami, Florida 33165'));
assert.equal(exactStreet(exact,'5550 Southwest 87th Avenue 33166'),false);
const trap=rows.find(r=>r.id==='zillow-44205211');
assert.equal(findProperties([trap],media,'555 SW 87th Ave',true).length,0);
const mergedAlias=rows.find(row=>(row.searchZips||[]).length && (row.searchAddresses||[]).length);
if(mergedAlias){
  const oldAddress=mergedAlias.searchAddresses[0];
  const oldZip=mergedAlias.searchZips[0];
  const query=oldAddress+', Miami FL '+oldZip;
  assert.ok(exactStreet(mergedAlias,query),'Merged address remains exact with its alternate ZIP');
  assert.ok(findProperties(rows,media,query,true).some(row=>row.id===mergedAlias.id),'Merged address and ZIP find the canonical record');
  assert.ok(findProperties(rows,media,oldZip,true).some(row=>row.id===mergedAlias.id),'ZIP-only search includes merged aliases');
}
console.log('Verified',examples.length,'property comparisons, typed address fallbacks, MLS and geographic matching.');

for(const [english,spanish] of [
  ['3 beds in 33135','casas con 3 dormitorios en 33135'],
  ['3 beds','3 dormitorios'],
  ['Coconut Grove photo galleries','galerías de fotos en Coconut Grove'],
  ['aerial photos','fotos aéreas'],
  ['under $500k','menos de $500k'],
  ['near Shenandoah Middle School','cerca de la escuela Shenandoah Middle'],
  ['River Lofts Condo','edificio River Lofts Condo'],
]){
  const hits=query=>findProperties(rows,media,query,true).map(row=>row.id);
  const expected=hits(english);
  assert.ok(expected.length>0,english);
  assert.deepEqual(new Set(hits(spanish)),new Set(expected),spanish);
}
const unit=rows.find(row=>row.address==='1021 NW 3rd St APT 307');
assert.ok(unit);
for(const query of ['1021 Northwest 3rd Street #307','1021 NW 3rd St unidad 307']) assert.ok(exactStreet(unit,query),query);
assert.equal(exactStreet(unit,'1021 NW 3rd St #308'),false);
console.log('Verified Spanish query equivalence, recorded building names and apartment aliases.');
