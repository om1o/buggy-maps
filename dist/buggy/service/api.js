import {supabaseUrl,publishableKey} from '../ride-config.js';

export async function api(path, body, session, method='POST') {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),12000);
  try {
    const response=await fetch(supabaseUrl + path, {
      method,mode:'cors',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',
      headers:{apikey:publishableKey,'Content-Type':'application/json',...(session?{Authorization:'Bearer '+session}:{})},
      body:body===undefined?undefined:JSON.stringify(body), signal:controller.signal,
    });
    const text=await response.text();
    let data=null;
    try{data=text?JSON.parse(text):null;}catch{}
    if(!response.ok){const error=new Error('Request failed');error.http=response.status;error.code=data?.code;throw error;}
    return data;
  } finally {clearTimeout(timeout);}
}
export const rpc=(name,args={},session)=>api('/rest/v1/rpc/buggy_'+name,args,session);
export function newToken(){
  return Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
}
