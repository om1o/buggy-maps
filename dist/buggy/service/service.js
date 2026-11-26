import {rpc} from './api.js';
import {confirmParentAction,parentBookingURL} from '../parent-actions.js';
import {params,lang,t,main,el,link,button,title,panel,periods,states,weekdays,formattedDate,pair,officialLink,mapURL,notice,networkError} from './shared.js';

document.documentElement.lang=lang;
const back=document.querySelector('#back');back.href=mapURL();back.textContent=t('Map','Mapa');
const langButton=document.querySelector('#language');langButton.textContent=t('Español','English');
langButton.onclick=()=>{const next=new URL(location.href);next.searchParams.set('lang',lang==='en'?'es':'en');location.replace(next);};
document.querySelector('#official').textContent=t('Buggy transportation','Transporte Buggy');
const staff=document.querySelector('#staff');staff.textContent=t('Operator sign in','Acceso de operadores');staff.href='?view=operator&lang='+lang;

function privateURL(token) {
  const url=new URL('./',location.href);url.searchParams.set('lang',lang);url.hash='ride='+token;return url.href;
}
async function showCard(token) {
  title(t('Family access','Acceso familiar'),t('Your ride card','Tu tarjeta de transporte'),t('Return here for the latest response to your request.','Consulta aquí la respuesta más reciente a tu solicitud.'));
  const record=await rpc('family_status',{p_token:token});
  if(!record){const box=panel(t('Private link unavailable','Enlace privado no disponible'));box.append(el('p',t('Open the complete private link saved after submitting your request.','Abre el enlace privado completo que guardaste al enviar tu solicitud.')),officialLink());return;}
  const box=panel(record.expired?t('Confirmation expired','Confirmación vencida'):states[record.status]);box.append(pair(record.home,record.school));
  box.append(el('p',periods[record.period]+' · '+t('Updated ','Actualizada ')+formattedDate(record.updatedAt),'meta'));
  if(record.status==='confirmed'&&!record.expired){
    box.append(el('p',weekdays.filter((_,i)=>record.days&(1<<i)).join(' · '),'status good'));
    for(const [prefix,v] of [[periods.am,record.amWindow],[periods.pm,record.pmWindow]])if(v)box.append(el('p',prefix+' · '+v));
    box.append(el('p',t('Valid through ','Válida hasta ')+formattedDate(record.validUntil)));
  }
  if(record.expired)box.append(el('p',t('Contact Buggy for current service availability.','Consulta con Buggy la disponibilidad actual.')));
  if(record.note)box.append(el('p',record.note,'context'));
  const actions=el('div',null,'actions'),status=notice(box);
  const prompt=(trigger,heading,message,confirmLabel,onConfirm)=>confirmParentAction({language:lang,trigger,heading,message,confirmLabel,onConfirm});
  const copy=button(t('Copy private link','Copiar enlace privado'),()=>prompt(copy,
    t('Copy this private ride card?','¿Copiar esta tarjeta privada?'),
    t('Anyone you give the link to can see the home, school and ride details.','Quien reciba el enlace podrá ver la casa, la escuela y los datos del transporte.'),
    t('I’m a parent or guardian. Copy link','Soy madre, padre o tutor. Copiar enlace'),async()=>{
      try {await navigator.clipboard.writeText(privateURL(token));status.textContent=t('Private link copied.','Enlace privado copiado.');}
      catch {status.textContent=t('Copy this page’s address from your browser.','Copia la dirección de esta página desde el navegador.');}
    }),true);
  const print=button(t('Print or save card','Imprimir o guardar tarjeta'),()=>prompt(print,
    t('Print the private ride details?','¿Imprimir los datos privados del transporte?'),
    t('The printout includes the home, school and any pickup windows on this card.','La copia impresa incluye la casa, la escuela y los horarios de recogida que figuren en la tarjeta.'),
    t('I’m a parent or guardian. Print','Soy madre, padre o tutor. Imprimir'),()=>window.print()));
  actions.append(copy,print,button(t('Refresh status','Actualizar estado'),()=>window.location.reload()),officialLink(false));
  box.append(actions);
}

function familyCardEntry(token) {
  title(t('For parents and guardians','Para madres, padres y tutores'),t('Private ride card','Tarjeta privada de transporte'),
    t('This card can contain a family’s home, school and pickup information. Open it only if it was shared with you for this ride.',
      'Esta tarjeta puede contener la casa, la escuela y datos de recogida de una familia. Ábrela solo si la recibiste para este trayecto.'));
  const box=panel(),open=button(t('I’m a parent or guardian. View card','Soy madre, padre o tutor. Ver tarjeta'),async()=>{
    open.disabled=true;
    try {await showCard(token);}catch {serviceError();}
  },true);
  box.append(link(t('Back to map','Volver al mapa'),new URL('../',import.meta.url).href),open);
}

function serviceError() {
  title('Buggy',t('Service unavailable','Servicio no disponible'),networkError());
  const box=panel();box.append(button(t('Try again','Reintentar'),()=>location.reload(),true),officialLink(false));
}

async function start(){
  main.setAttribute('aria-busy','true');
  try {
    const token=new URLSearchParams(location.hash.slice(1)).get('ride');
    if(token!==null && /^[a-f0-9]{64}$/.test(token))familyCardEntry(token);
    else if(token!==null){
      title(t('For families','Para familias'),t('Private link unavailable','Enlace privado no disponible'),
        t('Use the complete private link originally provided for the ride.','Usa el enlace privado completo que recibiste para el trayecto.'));
    }else if(params.get('view')==='operator')await (await import('./operator.js')).openOperator();
    else location.replace(parentBookingURL({schoolId:params.get('school'),language:lang,base:new URL('../',import.meta.url)}));
  } catch {
    serviceError();
  } finally { main.removeAttribute('aria-busy'); }
}
start();
