// The published baseline owns each existing record. New gallery rows can add a
// dwelling only once; an ID or a disclosed county folio already present wins.
export function mergeHomeRows(baselineRows, galleryRows=[]) {
  const base=Array.isArray(baselineRows)?baselineRows:[];
  if(!Array.isArray(galleryRows)||!galleryRows.length)return base;
  const ids=new Set(base.map(row=>row.id));
  const folios=new Set();
  const folio=row=>!row.withheld && /^\d{13}$/.test(String(row.folio||''))?String(row.folio):'';
  for(const row of base){const f=folio(row);if(f)folios.add(f);}
  const merged=base.slice();
  for(const row of galleryRows) {
    if(!row || typeof row.id!=='string' || !row.id || ids.has(row.id))continue;
    const f=folio(row);if(f && folios.has(f))continue;
    ids.add(row.id);if(f)folios.add(f);merged.push(row);
  }
  return merged;
}
