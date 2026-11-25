import {loadJSON} from './data-loader.js';
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const schoolWords = {escuela:'school',escuelas:'school',primaria:'elementary',intermedia:'middle',secundaria:'high',preparatoria:'high',privada:'private',privadas:'private',publica:'public',publicas:'public',colegio:'school',academia:'academy',chárter:'charter',suroeste:'sw',sureste:'se',noroeste:'nw',noreste:'ne'};
const ignored=new Set(['en','de','la','las','el','the','in','at','of','near','me','cerca','school','schools']);
const toWords = value => norm(value).split(' ').map(w=>schoolWords[w] || w).filter(w=>w && !ignored.has(w));
export function createSchoolDirectory() {
  let list=[], byId=new Map(), ready=false, pending;
  async function load() {
    if(ready) return list;
    if(pending) return pending;
    pending=(async()=>{
      try {
        const data=await loadJSON('data/schools.json',{timeoutMs:18000});
        if(!Array.isArray(data.schools) || !data.schools.length) throw Error('School directory unavailable');
        const next=new Map();
        for(const school of data.schools) {
          if(!school || typeof school.id!=='string'||typeof school.name!=='string'||next.has(school.id)) continue;
          school._name=norm(school.name);
          school._search=norm([school.name,...(school.aliases||[]),school.address,school.city,school.zip,school.type,school.grades].join(' '));
          school._tokens=new Set(school._search.split(' ')); next.set(school.id,school);
        }
        if(!next.size) throw Error('School directory unavailable');
        byId=next;list=[...next.values()];ready=true;
        return list;
      } finally {pending=null;}
    })();
    return pending;
  }
  function search(value='') {
    if(!value.trim()) return list;
    const raw=norm(value), words=toWords(value);
    if(!words.length)return list;
    const ranked=[];
    for(const school of list) {
      if(!words.every(w=>school._tokens.has(w)||school._search.includes(w)))continue;
      let score=school._name===raw?800:school._name.startsWith(raw)?240:school._name.includes(raw)?130:0;
      for(const w of words)score+=(school._tokens.has(w)?8:1)+(school._name.includes(w)?12:0);
      ranked.push({school,score});
    }
    return ranked.sort((a,b)=>b.score-a.score||a.school.name.localeCompare(b.school.name)).map(x=>x.school);
  }
  return {load,search,get:id=>byId.get(id),get ready(){return ready;},get all(){return list;}};
}
