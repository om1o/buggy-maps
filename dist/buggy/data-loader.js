// Only these resources have an optional compressed copy. County shards are gzip-only.
const compressedPaths=new Set(["data/index.json","data/search-places.json","data/media.json","data/schools.json"]);
const object=value=>Boolean(value)&&typeof value==="object"&&!Array.isArray(value);
const failure=(message,code)=>Object.assign(new Error(message),{code});
const abortError=()=>new DOMException("Data loading cancelled","AbortError");

export function validateDataset(path,data){
  let valid=true;
  if(path==="data/index.json"){
    const ids=new Set();
    valid=Array.isArray(data)&&data.length>0&&data.every(row=>{
      if(!object(row)||typeof row.id!=="string"||!row.id||ids.has(row.id)||typeof row.address!=="string")return false;
      ids.add(row.id);
      return (!row.detailUrl||/^data\/(?:properties|county)\/[a-z0-9_-]+\.json$/i.test(row.detailUrl))
        && ["searchAddresses","searchZips"].every(key=>row[key]===undefined||Array.isArray(row[key])&&row[key].every(value=>typeof value==="string"));
    });
  }else if(path==="data/gallery-homes.json"){
    valid=object(data)&&Array.isArray(data.homes)&&data.homes.every(row=>object(row)&&row.supplemental===true&&row.county===true&&/^county-\d{13}$/.test(row.id)&&row.id==="county-"+row.folio&&typeof row.address==="string"&&row.address.trim()&&Number.isFinite(row.lat)&&Number.isFinite(row.lng)&&/^data\/county\/gh[0-9]+\.json$/.test(row.detailUrl));
  }else if(path==="data/schools.json"){
    const ids=new Set();
    valid=object(data)&&Array.isArray(data.schools)&&data.schools.length>0&&data.schools.every(school=>{
      if(!object(school)||typeof school.id!=="string"||!school.id||ids.has(school.id)||
          typeof school.name!=="string"||!school.name.trim())return false;
      ids.add(school.id);
      return school.lat==null&&school.lng==null ||
        Number.isFinite(school.lat)&&Math.abs(school.lat)<=90&&Number.isFinite(school.lng)&&Math.abs(school.lng)<=180;
    });
  }else if(path==="data/media.json"){
    valid=object(data)&&Object.values(data).every(items=>Array.isArray(items)&&items.every(item=>object(item)&&typeof item.url==="string"&&typeof item.type==="string"));
  }else if(path==="data/search-places.json"){
    valid=object(data)&&Object.values(data).every(place=>object(place)&&["neighborhoods","subdivisions","schools"].every(key=>place[key]===undefined||Array.isArray(place[key])&&place[key].every(value=>typeof value==="string")));
  }else if(path==="data/property-aliases.json"){
    valid=object(data)&&Object.values(data).every(id=>typeof id==="string"&&Boolean(id));
  }else if(path==="data/coverage.json"){
    valid=object(data)&&["totalRecords","countyRecords","aerialRecords"].every(key=>Number.isInteger(data[key])&&data[key]>=0)&&Number.isFinite(Date.parse(data.capturedAt));
  }else valid=object(data);
  if(!valid)throw failure("This data file could not be read. Please retry.","INVALID_DATA");
  return data;
}

export async function loadJSON(path,{signal,timeoutMs=20000,fetcher=globalThis.fetch,decompress=globalThis.DecompressionStream,validate=validateDataset}={}){
  if(signal?.aborted)throw abortError();
  const controller=new AbortController();
  const compressedOnly=/^data\/county\/[a-z0-9_-]+\.json$/i.test(path);
  let timer,onAbort,stop;
  const stopped=new Promise((_,reject)=>{stop=reject;});
  onAbort=()=>{controller.abort();stop(abortError());};
  signal?.addEventListener("abort",onAbort,{once:true});
  timer=setTimeout(()=>{
    stop(failure("Loading took too long. Check your connection and retry.","DATA_TIMEOUT"));
    controller.abort();
  },timeoutMs);
  async function read(url,compressed){
    const response=await fetcher(url,{signal:controller.signal});
    if(!response.ok)throw failure("This data file is unavailable. Please retry.","HTTP_ERROR");
    let text;
    if(compressed){
      const bytes=new Uint8Array(await response.arrayBuffer());
      // Some hosts send Content-Encoding and the browser has already decoded it.
      text=bytes[0]===0x1f&&bytes[1]===0x8b
        ?await new Response(new Blob([bytes]).stream().pipeThrough(new decompress("gzip"))).text()
        :new TextDecoder().decode(bytes);
    }else text=await response.text();
    if(controller.signal.aborted)throw abortError();
    let data;
    try{data=JSON.parse(text);}catch{throw failure("This data file could not be read. Please retry.","INVALID_DATA");}
    return validate(path,data);
  }
  async function run(){
    if(compressedOnly&&typeof decompress!=="function")throw failure("Update your browser to open the complete property record. The basic overview is available.","UNSUPPORTED_DECOMPRESSION");
    if((compressedOnly||compressedPaths.has(path))&&typeof decompress==="function"){
      try{return await read(path+".gz",true);}catch(error){
        if(controller.signal.aborted||error?.name==="AbortError"||compressedOnly)throw error;
      }
    }
    return read(path,false);
  }
  try{return await Promise.race([run(),stopped]);}
  finally{clearTimeout(timer);signal?.removeEventListener("abort",onAbort);}
}

export function resultPage(rows,{sort="relevance",page=1,size=12}={}){
  const order=["relevance","address","beds","area"].includes(sort)?sort:"relevance";
  const sorted=order==="relevance"?rows:rows.slice().sort((a,b)=>{
    if(order==="address")return (a.address||"").localeCompare(b.address||"","en",{numeric:true})||a.id.localeCompare(b.id);
    const key=order==="beds"?"beds":"sqft";
    return (Number(b[key])||0)-(Number(a[key])||0)||(a.address||"").localeCompare(b.address||"","en",{numeric:true})||a.id.localeCompare(b.id);
  });
  const pages=Math.max(1,Math.ceil(sorted.length/size));
  const current=Math.max(1,Math.min(pages,Number.isSafeInteger(Number(page))?Number(page):1));
  const start=(current-1)*size;
  return {rows:sorted.slice(start,start+size),page:current,pages,start,total:sorted.length,sort:order};
}

export function resultsParams(search,changes={}){
  const params=new URLSearchParams(search);
  params.delete("property");
  for(const [key,value] of Object.entries(changes)){
    if(value===null||value===""||key==="page"&&Number(value)===1||key==="sort"&&value==="relevance")params.delete(key);
    else params.set(key,String(value));
  }
  return params;
}
