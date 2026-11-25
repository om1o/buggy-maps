import {bookingDetails, parentBookingURL} from '../parent-actions.js';

const root = new URL('../', import.meta.url);
const byId = id => document.getElementById(id);
let language = new URLSearchParams(location.search).get('lang') === 'es' ? 'es' : 'en';
let current;
function render() {
  current = bookingDetails(location.search, language);
  const es = language === 'es';
  const clean = parentBookingURL({schoolId:current.schoolId,destination:current.destination,language,base:root});
  if (location.href !== clean) history.replaceState(null,'',clean);
  document.documentElement.lang=language;
  document.title=es?'Reservas para familias · Buggy Maps':'Parent booking · Buggy Maps';
  byId('label').textContent=es?'Para madres, padres y tutores':'For parents and guardians';
  byId('heading').textContent=current.heading;
  byId('details').textContent=current.message;
  byId('language').textContent=es?'English':'Español';
  byId('language').lang=es?'en':'es';
  const map = new URL(root);
  if (current.schoolId) {
    map.searchParams.set('mode','schools');
    map.searchParams.set('school',current.schoolId);
  }
  if(es)map.searchParams.set('lang','es');
  byId('back').href=map.href;
  byId('back').textContent=es?'Volver al mapa':'Back to map';
  byId('confirm').textContent=current.confirmLabel;
  byId('confirm').disabled=false;
}
byId('language').addEventListener('click',()=>{language=language==='es'?'en':'es';render();});
byId('confirm').addEventListener('click',()=>{
  const a=document.createElement('a');
  a.href=current.url;
  a.rel='noopener noreferrer';
  a.referrerPolicy='no-referrer';
  a.click();
});
render();
