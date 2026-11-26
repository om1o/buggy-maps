import {api,rpc} from './api.js';
import {t,el,button,submit,title,panel,field,periods,states,levels,weekdays,formattedDate,pair,notice,busy,networkError} from './shared.js';

let session=null;
let expiry=0;
const day=t('Valid through','Válido hasta');
const security=t('Sign in with your approved Buggy operator account.','Accede con tu cuenta de operador autorizada por Buggy.');
function call(name,data){
  if(!session||Date.now()>=expiry){openOperator();throw new Error('Session expired');}
  return rpc(name,data,session);
}
function addFields(form,...items){const row=el('div',null,'fields');for(const item of items)row.append(item.wrap);form.append(row);}
function disclosure(name){const details=el('details'),summary=el('summary',name),form=el('form');details.append(summary,form);return [details,form];}
function serviceArea(box,areas){
  const [details,form]=disclosure(t('School and ZIP availability','Disponibilidad por escuela y código postal'));
  for(const a of areas){
    const p=el('p',a.school+' · '+a.zip+' · '+periods.am+' '+levels[a.morning]+' · '+periods.pm+' '+levels[a.afternoon]+' · '+formattedDate(a.valid_until),'meta');details.insertBefore(p,form);
  }
  const school=field(t('Official school name','Nombre oficial de la escuela')),zip=field(t('Pickup ZIP code','Código postal de recogida')),am=field(periods.am,'select',{options:Object.entries(levels),value:'closed'}),pm=field(periods.pm,'select',{options:Object.entries(levels),value:'closed'}),until=field(day,'date');
  school.input.maxLength=200;zip.input.pattern='[0-9]{5}';zip.input.maxLength=5;zip.input.inputMode='numeric';
  form.append(el('p',t('Publish general availability for this area. Individual seat assignments stay private.','Publica la disponibilidad general de esta zona. Las asignaciones de plazas permanecen privadas.'),'muted'));
  addFields(form,school,zip);addFields(form,am,pm);form.append(until.wrap);
  const save=submit(t('Publish area availability','Publicar disponibilidad de la zona'));form.append(save);const message=notice(form);
  form.onsubmit=e=>{e.preventDefault();busy(save,async()=>{await call('operator_area',{p_zip:zip.input.value,p_school:school.input.value,p_am:am.input.value,p_pm:pm.input.value,p_until:until.input.value});await queue(0);},message);};box.append(details);
}
function publicServicePair(box){
  const [details,form]=disclosure(t('Verified home-to-school service','Servicio verificado entre casa y escuela'));
  const home=field(t('Public atlas property ID','ID público de la propiedad')),school=field(t('Official school name','Nombre oficial de la escuela')),until=field(day,'date',{required:false}),state=field(t('Action','Acción'),'select',{options:[['on',t('Confirm service','Confirmar servicio')],['off',t('Withdraw confirmation','Retirar confirmación')]],value:'on'});
  home.input.maxLength=150;school.input.maxLength=200;until.input.required=true;state.input.onchange=()=>{until.input.required=state.input.value==='on';};
  form.append(el('p',t('Use an operator-verified service decision. Families’ bookings and pickup windows stay private.','Usa una decisión de servicio verificada por un operador. Las reservas y horarios de las familias permanecen privados.'),'muted'));
  addFields(form,home,school);addFields(form,state,until);
  let readyId='';
  const verify=button(t('Check address','Comprobar dirección'),()=>busy(verify,async()=>{
    readyId='';const result=await rpc('request_home',{p_id:home.input.value.trim()});if(!result)throw new Error();
    readyId=result.id;message.textContent=[result.address,result.city,result.zip].join(', ');save.disabled=false;
  },message)),save=submit(t('Save service decision','Guardar decisión de servicio'));
  save.disabled=true;home.input.oninput=()=>{readyId='';save.disabled=true;};const actions=el('div',null,'actions');actions.append(verify,save);form.append(actions);const message=notice(form);
  form.onsubmit=e=>{e.preventDefault();if(home.input.value.trim()!==readyId||!readyId)return;busy(save,async()=>{await call('operator_pair',{p_home:readyId,p_school:school.input.value,p_until:until.input.value||null,p_available:state.input.value==='on'});message.textContent=t('Service decision saved.','Decisión de servicio guardada.');},message);};box.append(details);
}
function requestForm(parent,row,offset){
  const [details,form]=disclosure(t('Review request','Revisar solicitud'));
  const updateState=field(t('Decision','Decisión'),'select',{options:['reviewing','confirmed','unavailable'].map(k=>[k,states[k]]),value:row.status==='received'?'reviewing':row.status});
  form.append(updateState.wrap);
  const schedule=el('div',null,'panel'),fieldset=el('fieldset'),legend=el('legend',t('Service days','Días de servicio')),days=el('div',null,'checks');
  const checkboxes=weekdays.map((label,i)=>{const wrap=el('label',null,'choice'),ch=el('input');ch.type='checkbox';ch.checked=!!(row.days&(1<<i));wrap.append(ch,el('span',label));days.append(wrap);return ch;});
  fieldset.append(legend,days);schedule.append(fieldset);
  const am=field(t('Morning pickup window','Horario de recogida por la mañana'),'text',{required:false,value:row.amWindow||''}),pm=field(t('Afternoon pickup window','Horario de recogida por la tarde'),'text',{required:false,value:row.pmWindow||''}),until=field(day,'date',{required:false,value:row.validUntil||''});
  const periodFields=[];if(row.period!=='pm')periodFields.push(am);if(row.period!=='am')periodFields.push(pm);for(const f of periodFields)f.input.maxLength=100;
  addFields(schedule,...periodFields);schedule.append(until.wrap);form.append(schedule);
  const setState=()=>{const confirmed=updateState.input.value==='confirmed';schedule.hidden=!confirmed;until.input.required=confirmed;for(const f of periodFields)f.input.required=confirmed;};
  updateState.input.onchange=setState;setState();
  const note=field(t('Private note to family','Nota privada para la familia'),'textarea',{required:false,value:row.note||''});note.input.maxLength=500;
  const save=submit(t('Update private ride card','Actualizar tarjeta privada'));form.append(note.wrap,save);const msg=notice(form);
  form.onsubmit=e=>{e.preventDefault();
    const mask=checkboxes.reduce((a,v,i)=>a+(v.checked?1<<i:0),0);
    if(updateState.input.value==='confirmed'&&!mask){msg.textContent=t('Choose at least one service day.','Selecciona al menos un día de servicio.');return;}
    busy(save,async()=>{
      try{await call('operator_update',{p_id:row.id,p_revision:row.revision,p_status:updateState.input.value,p_days:mask,p_am:am.input.value,p_pm:pm.input.value,p_until:until.input.value||null,p_note:note.input.value});}
      catch(e){if(e.code==='40001'){msg.textContent=t('Another operator changed this request. Refresh the queue to review it.','Otro operador actualizó esta solicitud. Recarga la lista y revísala.');return;}throw e;}
      await queue(offset);
    },msg);
  };parent.append(details);
}

async function queue(offset=0){
  const [rows,areas]=await Promise.all([call('operator_queue',{p_offset:offset}),call('operator_areas')]);
  if(!Array.isArray(rows)||!Array.isArray(areas))throw new Error('Response error');
  title(t('Buggy operations','Operaciones Buggy'),t('Ride service','Servicio de transporte'),t('Review private family requests and manage verified service availability.','Revisa las solicitudes privadas y administra la disponibilidad verificada.'));
  const controls=panel(t('Service availability','Disponibilidad del servicio'));serviceArea(controls,areas);publicServicePair(controls);
  const box=panel(t('Pickup requests','Solicitudes de transporte')),list=el('div',null,'records');box.append(list);
  if(!rows.length)list.append(el('p',t('No pickup requests on this page.','No hay solicitudes en esta página.')));
  for(const row of rows){const article=el('article');article.append(el('p',states[row.status],'status'),pair(row.home,row.school),el('p',periods[row.period]+' · '+row.language.toUpperCase()+' · '+formattedDate(row.createdAt),'meta'));requestForm(article,row,offset);list.append(article);}
  const actions=el('div',null,'actions');box.append(actions);const msg=notice(box);
  const navigation=(word,to)=>{const b=button(word,()=>busy(b,()=>queue(to),msg));actions.append(b);};
  if(offset>0)navigation(t('Previous','Anterior'),Math.max(0,offset-40));
  if(rows.length===40)navigation(t('Next','Siguiente'),offset+40);
  navigation(t('Refresh','Actualizar'),offset);
  actions.append(button(t('Sign out','Cerrar sesión'),async()=>{
    const current=session;session=null;expiry=0;openOperator();
    try{await api('/auth/v1/logout?scope=local',undefined,current);}catch{}
  }));
}
export function openOperator(){
  session=null;expiry=0;
  title(t('Operator access','Acceso de operadores'),t('Team sign in','Acceso del equipo'),security);
  const box=panel(t('Buggy operator account','Cuenta de operador Buggy')),form=el('form'),email=field(t('Work email','Correo de trabajo'),'email'),pass=field(t('Password','Contraseña'),'password');
  email.input.autocomplete='username';pass.input.autocomplete='current-password';
  const sign=submit(t('Sign in','Acceder'));form.append(email.wrap,pass.wrap,sign);const status=notice(form);box.append(form);
  form.onsubmit=async e=>{
    e.preventDefault();sign.disabled=true;status.textContent='';
    try{
      const result=await api('/auth/v1/token?grant_type=password',{email:email.input.value.trim(),password:pass.input.value});
      pass.input.value='';if(!result?.access_token)throw new Error();
      session=result.access_token;expiry=Date.now()+Math.max(0,result.expires_in-15)*1000;await queue();
    }catch(error){
      const prior=session;session=null;expiry=0;if(prior)try{await api('/auth/v1/logout?scope=local',undefined,prior);}catch{}
      status.textContent=error.http===400||error.http===401||error.http===403?t('Sign-in details or approved operator access could not be verified.','No se pudo verificar el acceso de operador ni las credenciales.'):networkError();
    }finally{pass.input.value='';sign.disabled=false;}
  };
}
