import {parentBookingURL} from '../parent-actions.js';
export const params=new URLSearchParams(location.search);
export const lang=params.get('lang')==='es'?'es':'en';
export const t=(en,es)=>lang==='es'?es:en;
export const main=document.querySelector('main');
export function el(tag,text,cls){
  const element=document.createElement(tag);
  if(text!=null)element.textContent=text;
  if(cls)element.className=cls;
  return element;
}
export function link(label,url,primary=false,newTab=false){
  const a=el('a',label,'action'+(primary?' primary':''));a.href=url;
  if(newTab){a.target='_blank';a.rel='noopener noreferrer';}
  return a;
}
export function button(label,fn,primary=false){
  const b=el('button',label,primary?'primary':'');b.type='button';b.addEventListener('click',fn);return b;
}
export function submit(label){const b=el('button',label,'primary');b.type='submit';return b;}
export function title(kicker,heading,intro){
  main.replaceChildren(el('p',kicker,'eyebrow'),el('h1',heading));
  if(intro)main.append(el('p',intro,'lead'));
  main.removeAttribute('aria-busy');
  document.title='Buggy · '+heading;
}
export function panel(heading){
  const box=el('section',null,'panel');
  if(heading)box.append(el('h2',heading));main.append(box);return box;
}
export function field(label,type='text',{options=[],required=true,value=''}={}){
  const wrap=el('label',label,'field');
  const input=type==='select'?el('select'):type==='textarea'?el('textarea'):el('input');
  if(input.tagName==='INPUT')input.type=type;
  for(const [v,l] of options){const o=el('option',l);o.value=v;input.append(o);}
  input.required=required;input.value=value;
  wrap.append(input);return {wrap,input};
}
export const periods={am:t('Morning','Mañana'),pm:t('Afternoon','Tarde'),both:t('Morning and afternoon','Mañana y tarde')};
export const states={received:t('Received','Recibida'),reviewing:t('Under review','En revisión'),confirmed:t('Confirmed','Confirmada'),unavailable:t('Unavailable','Sin disponibilidad')};
export const levels={open:t('Open','Disponible'),waitlist:t('Waitlist','Lista de espera'),closed:t('Closed','Cerrado')};
export const weekdays=t(['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],['Lun','Mar','Mié','Jue','Vie','Sáb','Dom']);
export function formattedDate(value){
  if(!value)return '';
  return new Intl.DateTimeFormat(lang==='es'?'es-US':'en-US',{month:'short',day:'numeric',year:'numeric',
    timeZone:value.length===10?'UTC':'America/New_York'}).format(new Date(value.length===10?value+'T12:00:00Z':value));
}
export function pair(home,school){
  const list=el('div',null,'route');
  for(const [key,v] of [[t('Home','Casa'),[home?.address,home?.city,home?.zip].filter(Boolean).join(', ')],[t('School','Escuela'),school]]){
    const row=el('div',null,'stack');row.append(el('small',key),el('strong',v));list.append(row);
  }
  return list;
}
export function officialLink(primary=true){
  return link(t('Continue on Buggy’s website','Continuar en el sitio de Buggy'),parentBookingURL({destination:'website',language:lang,base:new URL('../',import.meta.url)}),primary,true);
}
export function mapURL(){const u=new URL('../',location.href);if(params.get('home'))u.searchParams.set('map',params.get('home'));if(params.get('school'))u.searchParams.set('school',params.get('school'));if(lang==='es')u.searchParams.set('lang','es');return u.href;}
export function notice(parent){const n=el('p',null,'notify');n.setAttribute('role','status');parent.append(n);return n;}
export const networkError=()=>t('Couldn’t reach the ride service. Try again.','No se pudo conectar con el servicio. Inténtalo de nuevo.');
export async function busy(b,fn,status){
  b.disabled=true;status.textContent='';
  try{await fn();}catch{status.classList.add('error');status.textContent=networkError();}finally{b.disabled=false;}
}
