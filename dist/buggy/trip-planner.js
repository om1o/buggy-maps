// Family trips use local state. Public sharing opens a school profile unless a guardian chooses an exact route.
import {createCommuteWorkspace, driveFacts, printRouteButton} from './commute-workspace.js';
import {confirmParentAction, parentBookingURL} from './parent-actions.js';
import {districtSchoolLocator} from './school-discovery.js';
import {savedButton} from './saved-places.js';
import {publicSharing, publicMapURL} from './share-link.js';

const groveSchoolId = 'fl-13-0841';
const mapBase = new URL('./', import.meta.url);
function bookingLink(school, language, destination = 'finder') {
  return parentBookingURL({schoolId:school?.id, language, destination, base:mapBase});
}

const copy = {
  en: {
    schools: 'Miami-Dade schools', school: 'School', schoolsNear: 'Schools in the directory', matches: 'Matching schools',
    findSchool: 'Choose a school on the map or search by name or ZIP.', noSchools: 'No schools matched this search.',
    directory: 'School directory', schoolCount: n => n.toLocaleString('en-US') + (n===1?' school in the directory':' schools in the directory'),
    matchCount: n => n.toLocaleString('en-US') + (n===1?' matching school':' matching schools'),
    backSchools: 'All schools', public: 'Public school', charter: 'Charter school', private: 'Private school',
    grades: 'Grades', phone: 'School phone', website: 'School website', source: 'Directory source', imageCredit: 'Image credit',
    aerial: 'Campus-area aerial', exterior: 'School exterior', imageMissing: 'Campus image unavailable.',
    campus: 'Campus image', tryImage: 'Retry image', schoolDirections: 'Directions to this school',
    locationUnknown: 'Pin location unavailable. Use the published school address for directions.',
    directions: 'Directions', drive: 'Driving preview', home: 'Home', from: 'From', to: 'To',
    schoolPlaceholder: 'School name or ZIP', homePlaceholder: 'Street address or ZIP',
    editHome: 'Change home', editSchool: 'Change school', reverse: 'Reverse direction',
    calculating: 'Finding a road route…', chooseBoth: 'Choose a home and a school to see the drive.',
    needHome: 'Choose a home address to see this drive.', needSchool: 'Choose a school to see this drive.',
    oneCompared: 'Select View drive for directions, or add another school to compare.',
    severalCompared: 'Select View drive next to a school for its directions and arrival planner.',
    homeHelp: 'Enter at least two characters.', notFound: 'No matches. Try a street name, school name, or ZIP.',
    noLookup: 'Search is unavailable. Try again.', browse: 'Find a route', distance: 'Road distance',
    driveTime: 'Estimated car drive', approximate: 'Car time uses mapped streets and excludes traffic, parking and school drop-off lines. Buggy confirms its own pickup time.',
    unknownRoute: 'An in-app driving route is unavailable for this pair. Try a directions link below.',
    showRoute: 'Find driving route', retry: 'Try route again', sourcePrefix: 'Road data',
    guidance: 'Open directions', share: 'The school link keeps your home address private.',
    service: 'Buggy school rides', check: 'Checking Buggy service…', unconfirmed: 'Pickup time and seat availability need confirmation from Buggy.',
    confirmed: 'Buggy has confirmed service for this home and school.', lookupError: 'Service availability could not be checked.',
    until: 'Valid through', booking: 'Check rides with Buggy', operator: 'Find a ride with Buggy', officialPreview: 'Buggy’s ride finder showed 1.7 mi · 7 min on Nov 23, 2026. Seat availability was unconfirmed.', about: 'Buggy website',
    parent: 'For a parent or guardian', coverage: 'Check this address', coverageHeading: 'Check this home with Buggy?',
    coverageBody: (home,school) => 'Buggy’s service database will receive the property identifier for '+home+' and the school name '+school+' to look for a confirmed ride.',
    directionsHeading: provider => 'Open '+provider+'?', directionsBody: (provider,home,school) => provider+' will receive the locations of '+home+' and '+school+' to show this drive.',
    openProvider: provider => 'Open '+provider, printHeading:'Print this home and school?', printBody:(home,school) => 'The card will include '+home+', '+school+', a link to this exact drive and any arrival time you entered.',
    printConfirm:'Print route card', cancelChange: 'Keep previous selection', schoolAssignment: 'Check school assignment with the district and ride availability with Buggy.',
    areas: 'Buggy service areas', noAreas: 'Buggy has not published pickup ZIP codes for this school.', areasError: 'Service areas could not be checked.', checkingAreas: 'Checking confirmed pickup areas…', morning: 'Morning', afternoon: 'Afternoon', open: 'Open', waitlist: 'Waitlist', closed: 'Closed',
    everySchool: 'Show more school results', virtual: 'Virtual program. This directory entry has no physical pickup destination.', specialized: 'Contact the school to confirm the right location for this specialized program.', unavailableImage: 'A verified campus image is unavailable.'
  },
  es: {
    schools: 'Escuelas de Miami-Dade', school: 'Escuela', schoolsNear: 'Escuelas del directorio', matches: 'Escuelas encontradas',
    findSchool: 'Elige una escuela en el mapa o búscala por nombre o código postal.', noSchools: 'No se encontraron escuelas.',
    directory: 'Directorio escolar', schoolCount: n => n.toLocaleString('es-US') + (n===1?' escuela en el directorio':' escuelas en el directorio'),
    matchCount: n => n.toLocaleString('es-US') + (n===1?' escuela encontrada':' escuelas encontradas'),
    backSchools: 'Todas las escuelas', public: 'Escuela pública', charter: 'Escuela chárter', private: 'Escuela privada',
    grades: 'Grados', phone: 'Teléfono de la escuela', website: 'Sitio de la escuela', source: 'Fuente del directorio', imageCredit: 'Crédito de la imagen',
    aerial: 'Vista aérea del área escolar', exterior: 'Exterior de la escuela', imageMissing: 'Imagen del campus no disponible.',
    campus: 'Imagen del campus', tryImage: 'Volver a cargar', schoolDirections: 'Cómo llegar a esta escuela',
    locationUnknown: 'No hay ubicación exacta en el mapa. Usa la dirección publicada para obtener indicaciones.',
    directions: 'Cómo llegar', drive: 'Ruta en automóvil', home: 'Casa', from: 'Desde', to: 'Hasta',
    schoolPlaceholder: 'Escuela o código postal', homePlaceholder: 'Dirección o código postal',
    editHome: 'Cambiar casa', editSchool: 'Cambiar escuela', reverse: 'Invertir recorrido',
    calculating: 'Buscando una ruta por carretera…', chooseBoth: 'Elige una casa y una escuela para ver el trayecto.',
    needHome: 'Elige una dirección para ver el trayecto.', needSchool: 'Elige una escuela para ver el trayecto.',
    oneCompared: 'Pulsa Ver trayecto para ver las indicaciones o añade otra escuela para comparar.',
    severalCompared: 'Pulsa Ver trayecto junto a una escuela para ver las indicaciones y planear la llegada.',
    homeHelp: 'Escribe al menos dos caracteres.', notFound: 'Sin resultados. Prueba con una calle, escuela o código postal.',
    noLookup: 'La búsqueda no está disponible. Inténtalo de nuevo.', browse: 'Planear una ruta', distance: 'Distancia por carretera',
    driveTime: 'Tiempo estimado en auto', approximate: 'El tiempo en auto se calcula con las calles del mapa. El tráfico, el estacionamiento y la fila escolar requieren tiempo adicional. Buggy confirma la hora de recogida.',
    unknownRoute: 'No hay vista previa de esta ruta. Prueba con una de las aplicaciones de mapas.',
    showRoute: 'Buscar ruta en automóvil', retry: 'Volver a buscar la ruta', sourcePrefix: 'Datos viales',
    guidance: 'Abrir indicaciones', share: 'El enlace de la escuela mantiene privada la dirección de casa.',
    service: 'Transporte escolar Buggy', check: 'Consultando el servicio de Buggy…', unconfirmed: 'Buggy debe confirmar la hora de recogida y si hay un asiento disponible.',
    confirmed: 'Buggy confirmó el servicio entre esta casa y esta escuela.', lookupError: 'No se pudo consultar la disponibilidad del servicio.',
    until: 'Vigente hasta el', booking: 'Consultar transporte con Buggy', operator: 'Buscar transporte con Buggy', officialPreview: 'El 23 nov 2026, el buscador de Buggy indicó 1,7 mi · 7 min para este recorrido. La disponibilidad de un asiento quedó sin confirmar.', about: 'Sitio web de Buggy',
    parent: 'Para madres, padres o tutores', coverage: 'Consultar esta dirección', coverageHeading: '¿Consultar esta casa con Buggy?',
    coverageBody: (home,school) => 'La base de datos de Buggy recibirá el identificador de la propiedad '+home+' y el nombre de la escuela '+school+' para buscar un viaje confirmado.',
    directionsHeading: provider => '¿Abrir '+provider+'?', directionsBody: (provider,home,school) => provider+' recibirá las ubicaciones de '+home+' y '+school+' para mostrar el trayecto.',
    openProvider: provider => 'Abrir '+provider, printHeading:'¿Imprimir la dirección y la escuela?', printBody:(home,school) => 'La tarjeta incluirá '+home+', '+school+', un enlace a la ruta exacta y la hora de llegada que hayas indicado.',
    printConfirm:'Imprimir la ruta', cancelChange: 'Conservar la selección anterior', schoolAssignment: 'Consulta la escuela asignada con el distrito y la disponibilidad de transporte con Buggy.',
    areas: 'Zonas de servicio de Buggy', noAreas: 'Buggy aún no ha publicado códigos postales de recogida para esta escuela.', areasError: 'No se pudieron consultar las zonas de servicio.', checkingAreas: 'Consultando zonas de recogida confirmadas…', morning: 'Mañana', afternoon: 'Tarde', open: 'Disponible', waitlist: 'Lista de espera', closed: 'Cerrado',
    everySchool: 'Ver más resultados', virtual: 'Programa virtual. Esta entrada no tiene un destino físico para la recogida.', specialized: 'Consulta con la escuela cuál es la sede de este programa especializado.', unavailableImage: 'No hay una imagen verificada del campus.'
  }
};

const make = (tag, name, text) => {
  const element = document.createElement(tag);
  if (name) element.className = name;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
};

function safeURL(value, local = false) {
  if (!value || typeof value !== 'string') return '';
  try {
    const u = new URL(value, document.baseURI);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return '';
    if (!local && !/^https?:\/\//i.test(value)) return '';
    return u.href;
  } catch { return ''; }
}

function externalLink(label, url, className = 'tp-link') {
  const item = make('a', className, label);
  item.href = url;
  item.target = '_blank';
  item.rel = 'noopener noreferrer';
  return item;
}

function action(label, className, handler) {
  const item = make('button', className, label);
  item.type = 'button';
  item.addEventListener('click', handler);
  return item;
}

function locality(row) { return [row?.city,row?.state,row?.zip].filter(Boolean).join(' '); }
function schoolAddress(row) { return [row?.address, locality(row)].filter(Boolean).join(', '); }
function physicalSchool(school) { return school && (!school.campusType || school.campusType==='campus'); }
function hasPoint(row) { return Number.isFinite(row?.lat) && Number.isFinite(row?.lng); }
function schoolType(row, t) {
  const type = String(row.type || '');
  if (/charter|chárter/i.test(type)) return t.charter;
  if (/private|privad/i.test(type)) return t.private;
  if (/public|públic/i.test(type)) return t.public;
  return type || t.school;
}
function translatedImageLabel(school, t) {
  if (/aerial|overhead|aérea|ortho/i.test(school.imageLabel || '')) return t.aerial;
  if (/exterior|façade|facade/i.test(school.imageLabel || '')) return t.exterior;
  return school.imageLabel || t.campus;
}

function appendCampusImage(parent, school, t) {
  const src = safeURL(school.image, true);
  const small = safeURL(school.imageFallback, true);
  if (!src && !small) return;
  const figure = make('figure', 'tp-figure');
  const frame = make('div', 'tp-image-frame');
  const credit = make('figcaption', 'tp-photo-credit');
  const label = translatedImageLabel(school, t);
  credit.append(make('strong', '', label));
  const imageSource = safeURL(school.imageSource);
  if (school.imageCredit || imageSource) {
    credit.append(document.createTextNode(' · '));
    credit.append(imageSource ? externalLink(school.imageCredit || t.imageCredit, imageSource) : document.createTextNode(school.imageCredit));
  }
  if (school.imageLicense) {
    credit.append(document.createTextNode(' · '));
    credit.append(safeURL(school.imageLicenseUrl) ? externalLink(school.imageLicense, safeURL(school.imageLicenseUrl)) : document.createTextNode(school.imageLicense));
  }
  function load() {
    frame.classList.remove('tp-image-error');
    const image = make('img','tp-campus-image');
    image.alt = label + ' · ' + school.name;
    image.loading = 'lazy'; image.decoding = 'async'; image.referrerPolicy='no-referrer';
    function unavailable() {
      frame.classList.add('tp-image-error');
      frame.replaceChildren(make('span','',t.imageMissing), action(t.tryImage,'tp-link',load));
    }
    const preview=small && src && small!==src ? make('img','tp-campus-image tp-preview') : null;
    if (!preview) {
      image.addEventListener('error',unavailable,{once:true});frame.replaceChildren(image);image.src=src||small;
      return;
    }
    preview.alt=image.alt; preview.loading='lazy';preview.decoding='async';preview.referrerPolicy='no-referrer';
    let failedPreview=false,failedFull=false;
    preview.addEventListener('error',()=>{failedPreview=true; if(failedFull) unavailable();},{once:true});
    image.addEventListener('error',()=>{failedFull=true;image.remove();if(failedPreview) unavailable();},{once:true});
    image.addEventListener('load',()=>{image.classList.remove('tp-upgrading'); image.alt=preview.alt;preview.remove();},{once:true});
    image.alt='';image.classList.add('tp-upgrading');
    frame.replaceChildren(preview,image);preview.src=small;image.src=src;
  }
  figure.append(frame, credit);
  parent.append(figure);
  load();
}

let instance = 0;
export function createTripPlanner(options) {
  const { panel, getHomes, getSchools, navigate } = options;
  const prefix = 'buggy-trip-' + (++instance);
  const commute=createCommuteWorkspace();
  let scope, state, t, focusKind = '', mounted = false, routeAttempt, editing;
  function reset() {
    scope?.abort();
    routeAttempt?.abort();
    if (mounted) options.clearRoute?.();
    mounted = false;
  }
  function go(mode, change={}) {
    const next = {mode,home:state.home?.id || null,school:state.school?.id || null,lang:state.language,dir:state.direction==='return'?'return':null,...change};
    navigate(next);
  }
  function intro(parent, overline, title, description) {
    const block = make('div','tp-intro');
    block.append(make('p','tp-kicker',overline),make('h1','tp-heading',title));
    if (description) block.append(make('p','tp-note',description));
    parent.append(block);
  }
  function schoolDirectory(parent) {
    const searchResults = Array.isArray(state.schools);
    let rows = searchResults ? state.schools : (getSchools('') || []);
    const filtered=Boolean(state.query || state.filtered);
    if (!filtered) {
      const available=new Set(rows.map(row=>row.id));
      const picks = ['fl-13-0841','fl-13-7461'].map(id=>options.getSchool?.(id)).filter(row=>row&&available.has(row.id));
      rows=[...new Map([...picks,...rows].map(row=>[row.id,row])).values()];
    }
    const total = Number(state.schoolTotal);
    intro(parent, 'Miami-Dade · Florida', filtered ? t.matches : t.schools,
      filtered ? t.matchCount(Number.isFinite(total)?total:rows.length)+(state.query?' · “'+state.query+'”':'') : (total > 0 ? t.schoolCount(total) : t.findSchool));
    if (!rows.length) { parent.append(make('p','tp-note',t.noSchools)); return; }
    const list = make('div','tp-directory-list');
    list.setAttribute('aria-label',state.query?t.matches:t.schoolsNear);
    const limit = filtered ? 12 : 6;
    function appendEntry(row) {
      const entry = action('','tp-school-entry',()=>go('schools',{school:row.id}));
      const symbol = make('span','tp-campus-icon');
      symbol.setAttribute('aria-hidden','true');
      const line = make('span','tp-school-entry-copy');
      line.append(make('strong','',row.name), make('small','',[schoolType(row,t),row.city || row.zip].filter(Boolean).join(' · ')));
      entry.append(symbol,line);
      list.append(entry);
    }
    if (!filtered && rows[0]?.image) {
      const feature=make('article','tp-campus-feature');
      appendCampusImage(feature,rows[0],t);
      const title = action(rows[0].name,'tp-feature-school',()=>go('schools',{school:rows[0].id}));
      feature.prepend(title);
      parent.append(feature);
      rows.slice(1,limit).forEach(appendEntry);
    } else rows.slice(0,limit).forEach(appendEntry);
    parent.append(list);
    if (rows.length>limit) {
      let count=limit;
      const more=action(t.everySchool,'tp-link',()=>{
        rows.slice(count,count+24).forEach(appendEntry);
        count += 24;
        if(count>=rows.length) more.remove();
      });
      parent.append(more);
    }
  }
  function schoolServiceAreas(parent, school) {
    const section=make('section','tp-school-areas'), label=make('h2','tp-subheading',t.areas);
    const info=make('p','tp-note',t.checkingAreas);
    info.setAttribute('role','status'); section.append(label,info); parent.append(section);
    const signal=scope.signal;
    (async()=>{
      try {
        const {listSchoolServiceAreas}=await import('./ride-data.js');
        if(signal.aborted) return;
        const rows=await listSchoolServiceAreas({school:school.name,signal});
        if(signal.aborted) return;
        if(!rows.length){ info.textContent=t.noAreas; return; }
        const list=make('ul','tp-areas');
        for(const area of rows) {
          const choice=make('li');
          choice.append(make('strong','',area.zip),make('small','',[area.morning?t.morning+' · '+(t[area.morning] || area.morning):'',area.afternoon?t.afternoon+' · '+(t[area.afternoon] || area.afternoon):''].filter(Boolean).join('  /  ')));
          list.append(choice);
        }
        info.replaceWith(list);
        options.showServiceAreas?.(rows);
      } catch { if(!signal.aborted) info.textContent=t.areasError; }
    })();
  }
  function schoolProfile(parent, row) {
    const back=action(t.backSchools, 'tp-back', ()=>go('schools',{school:null}));
    parent.append(back);
    intro(parent, schoolType(row,t), row.name, schoolAddress(row));
    const primary = action(t.schoolDirections,'tp-primary',()=>{focusKind=state.home?'':'home'; go('route');});
    if(physicalSchool(row)) parent.append(primary);
    else parent.append(make('p','tp-note',row.campusType==='virtual'?t.virtual:t.specialized));
    const share=publicSharing({kind:'school',language:state.language,getSchools:()=>[row],signal:scope.signal});
    const schoolActions=make('div','cw-route-actions tp-school-actions');
    schoolActions.append(savedButton({kind:'school',school:row},state.language),share.trigger);
    parent.append(schoolActions,share.panel,make('p','tp-fine',t.schoolAssignment));
    if(row.image) appendCampusImage(parent,row,t);
    else if(physicalSchool(row))parent.append(make('p','tp-fine',t.unavailableImage));
    const info=make('dl','tp-school-facts');
    if (row.grades) {
      const field=make('div');
      field.append(make('dt','',t.grades),make('dd','',Array.isArray(row.grades)?row.grades.join(', '):row.grades));
      info.append(field);
    }
    if (row.phone) {
      const tel=String(row.phone).replace(/[^\d+]/g,'');
      const field=make('div'), dd=make('dd');
      field.append(make('dt','',t.phone),dd);
      if (tel.length>=7) { const link=make('a','tp-link',row.phone);link.href='tel:'+tel;dd.append(link); }
      else dd.textContent=row.phone;
      info.append(field);
    }
    if(info.children.length) parent.append(info);
    const links=make('div','tp-resources');
    links.append(externalLink(state.language==='es'?'Buscador de escuelas del distrito':'District school locator',districtSchoolLocator));
    if(safeURL(row.website))links.append(externalLink(t.website,safeURL(row.website)));
    if(safeURL(row.sourceUrl))links.append(externalLink(t.source,safeURL(row.sourceUrl)));
    if(physicalSchool(row))links.append(externalLink(t.booking,bookingLink(row,state.language),'tp-secondary'));
    parent.append(links);
    if(physicalSchool(row) && !hasPoint(row)) parent.append(make('p','tp-fine',t.locationUnknown));
    if(physicalSchool(row)) schoolServiceAreas(parent,row);
  }
  function endpoint(kind, isStart) {
    const isHome=kind==='home', row=state[kind];
    const field=make('div','tp-endpoint '+(isStart?'tp-start':'tp-end'));
    const name=isHome?t.home:t.school;
    const label=make('label','tp-field-label',(isStart?t.from:t.to)+' · '+name);
    const controls=make('div','tp-field-controls');
    field.append(label,controls);
    if (row) {
      const changer=action('','tp-selected',()=>{
        editing={kind,id:row.id,other:state[isHome?'school':'home']?.id,dir:state.direction};
        focusKind=kind;go('route',{[kind]:null});
      });
      changer.id=prefix+'-'+kind;
      label.htmlFor=changer.id;
      changer.setAttribute('aria-label',(isHome?t.editHome:t.editSchool)+' · '+(isHome?row.address:row.name));
      changer.append(make('strong','',isHome?row.address:row.name),make('small','',isHome?locality(row):schoolAddress(row)));
      controls.append(changer);
      return field;
    }
    const input=make('input','tp-input');
    input.id=prefix+'-'+kind; label.htmlFor=input.id;
    input.type='search'; input.maxLength=140; input.autocomplete='off'; input.spellcheck=false;
    input.placeholder=isHome?t.homePlaceholder:t.schoolPlaceholder;
    const ul=make('ul','tp-suggestions'); ul.id=input.id+'-matches'; ul.hidden=true;
    ul.setAttribute('role','listbox'); ul.setAttribute('aria-label',name);
    const feedback=make('p','tp-input-status');feedback.setAttribute('role','status');feedback.hidden=true;
    input.setAttribute('role','combobox'); input.setAttribute('aria-autocomplete','list');
    input.setAttribute('aria-controls',ul.id);input.setAttribute('aria-expanded','false');
    controls.append(input,ul,feedback);
    const signal=scope.signal;
    const previous=editing?.kind===kind && editing.other===state[isHome?'school':'home']?.id && editing.dir===state.direction ? editing.id : null;
    function restore() { if(previous){editing=null;focusKind='';go('route',{[kind]:previous});} }
    if(previous) controls.append(action(t.cancelChange,'tp-link',restore));
    let timer,version=0,selected=-1,matches=[];
    function close() {
      clearTimeout(timer); version++; selected=-1;matches=[];ul.hidden=true;feedback.hidden=true;
      input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');
    }
    function highlight(index){
      selected=index;
      Array.from(ul.children).forEach((item,i)=>item.setAttribute('aria-selected',String(i===index)));
      const choice=ul.children[index];
      if(choice) {input.setAttribute('aria-activedescendant',choice.id); choice.scrollIntoView({block:'nearest'});}
    }
    async function search() {
      close();
      const v=version,term=input.value.trim();
      if(isHome && term.length<2) return;
      try {
        const rows=await (isHome?getHomes(term):getSchools(term));
        if(v!==version||signal.aborted||!field.isConnected)return;
        matches=(Array.isArray(rows)?rows:[]).filter(item=>item && !item.withheld && (isHome?item.address:item.name && physicalSchool(item))).slice(0,6);
        if(!matches.length){feedback.textContent=t.notFound; feedback.hidden=false;return;}
        ul.replaceChildren();
        matches.forEach((item,i)=>{
          const li=make('li','tp-option'); li.id=ul.id+'-'+i; li.setAttribute('role','option');li.setAttribute('aria-selected','false');
          li.append(make('strong','',isHome?item.address:item.name),make('small','',isHome?locality(item):schoolAddress(item)));
          li.addEventListener('pointerdown', e=>e.preventDefault());
          li.addEventListener('click',()=>pick(item));
          ul.append(li);
        });
        ul.hidden=false;input.setAttribute('aria-expanded','true');
      } catch {
        if(v!==version || signal.aborted)return;
        feedback.textContent=t.noLookup;feedback.hidden=false;
      }
    }
    function pick(item) {
      editing=null;close(); focusKind=(isHome&&!state.school)?'school':(!isHome&&!state.home)?'home':'';
      go('route',{[kind]:item.id});
    }
    function queue(){close();timer=setTimeout(search,130);}
    input.addEventListener('input',queue);
    input.addEventListener('focus',()=>{if(input.value || !isHome)queue();});
    // Keep the sheet still between pointer-down and click on options outside the field.
    input.addEventListener('blur',()=>{clearTimeout(timer);timer=setTimeout(close,200);});
    input.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();close();restore();return;}
      if(e.key==='ArrowDown'||e.key==='ArrowUp'){
        e.preventDefault();
        if(ul.hidden) {search().then(()=>{if(matches.length) highlight(e.key==='ArrowDown'?0:matches.length-1);});return;}
        highlight((selected+(e.key==='ArrowDown'?1:-1)+matches.length)%matches.length);
      }
      if(e.key==='Enter'){
        e.preventDefault();
        if(matches.length){pick(matches[selected<0?0:selected]);return;}
        search().then(()=>{if(matches.length && !signal.aborted)pick(matches[0]);});
      }
    });
    signal.addEventListener('abort',close,{once:true});
    if(focusKind===kind) {
      focusKind='';
      queueMicrotask(()=>{if(!signal.aborted && input.isConnected) input.focus({preventScroll:true});});
    }
    return field;
  }
  function routeURL(home,school) {
    const href=new URL(publicMapURL);
    const p=new URLSearchParams({mode:'route',home:home.id,school:school.id});
    if(state.direction==='return')p.set('dir','return');
    if(state.language==='es')p.set('lang','es');
    if(new URLSearchParams(location.search).get('layer')==='aerial')p.set('layer','aerial');
    href.search=p.toString();
    return href.href;
  }
  function sharing(parent,home,school){
    const group=make('div','tp-sharing');
    const share=publicSharing({kind:'route',language:state.language,getSchools:()=>[school],getExactURL:()=>routeURL(home,school),homeAddress:home.address,signal:scope.signal});
    const actions=make('div','cw-route-actions');
    actions.append(savedButton({kind:'route',home,school,direction:state.direction},state.language),share.trigger);
    const shareLinks=make('div','cw-route-actions tp-share-links');shareLinks.append(share.open,share.parentTrigger);
    group.append(actions,make('p','tp-fine',t.share),shareLinks,share.panel);
    parent.append(group);
    return actions;
  }
  function service(parent,home,school) {
    const section=make('section','tp-service');
    section.append(make('h2','tp-subheading',t.service));
    const signal=scope.signal;
    const status=make('p','tp-note',t.unconfirmed);status.setAttribute('role','status');
    const booking=externalLink(t.booking,bookingLink(school,state.language),'tp-primary');
    const links=make('div','tp-resources');
    const check=action(t.coverage,'tp-link',()=>confirmParentAction({
      language:state.language,heading:t.coverageHeading,message:t.coverageBody(home.address,school.name),
      confirmLabel:t.coverage,trigger:check,signal,onConfirm:checkCoverage
    }));
    check.setAttribute('aria-haspopup','dialog');
    links.append(check,externalLink(t.about,bookingLink(null,state.language,'website')));
    section.append(status);
    if(home.id==='county-0141290000480' && school.id===groveSchoolId && state.direction!=='return') {
      section.append(make('p','tp-operator-note',t.officialPreview));
    }
    section.append(booking,links); parent.append(section);
    async function checkCoverage() {
      if(signal.aborted || check.disabled)return;
      check.disabled=true;status.textContent=t.check;
      try {
        const {lookupRideCoverage}=await import('./ride-data.js');
        if(signal.aborted)return;
        const found=await lookupRideCoverage({propertyId:home.id,school:school.name,signal});
        if(signal.aborted)return;
        status.textContent=found?.status==='confirmed' ? t.confirmed : t.unconfirmed;
        if(found?.status==='confirmed' && found.validUntil) {
          const date=new Date(found.validUntil+'T12:00:00Z');
          if(Number.isFinite(date.getTime()))status.append(' '+t.until+' '+new Intl.DateTimeFormat(state.language==='es'?'es-US':'en-US',{dateStyle:'medium',timeZone:'UTC'}).format(date)+'.');
        }
      }catch{if(!signal.aborted)status.textContent=t.lookupError;}
      finally{if(!signal.aborted)check.disabled=false;}
    }
  }
  async function routeSummary(parent,home,school) {
    const reverse=state.direction==='return';
    const [from,to]=reverse?[school,home]:[home,school];
    const signal=scope.signal;
    const summary=make('section','tp-route-summary');summary.setAttribute('aria-live','polite');
    const nav=make('div','tp-navigation');
    parent.append(summary,nav);service(parent,home,school);
    const tools=make('div','cw-tools');parent.append(tools);
    const comparison=make('div','cw-tools');parent.append(comparison);
    const actions=sharing(parent,home,school);
    mountComparison(comparison);
    let routing,links;
    try {
      routing=await import('./trip-routing.js');
      if(signal.aborted)return;
      links=routing.directionsLinks(from,to);
      for(const [provider,href] of [['Google Maps',links.google],['Apple Maps',links.apple]]) {
        const url=safeURL(href);
        if(!url)continue;
        const button=action(provider,'tp-secondary',()=>confirmParentAction({
          language:state.language,heading:t.directionsHeading(provider),message:t.directionsBody(provider,home.address,school.name),
          confirmLabel:t.openProvider(provider),trigger:button,signal,onConfirm:()=>window.open(url,'_blank','noopener,noreferrer')
        }));
        button.setAttribute('aria-haspopup','dialog');
        nav.append(button);
      }
      nav.setAttribute('aria-label',t.guidance);
    }catch{
      if(!signal.aborted)summary.append(make('p','tp-note',t.unknownRoute));
      return;
    }
    async function estimate() {
      routeAttempt?.abort();
      const request=new AbortController(); routeAttempt=request;
      const cancel=()=>request.abort();
      signal.addEventListener('abort',cancel,{once:true});
      tools.replaceChildren();actions.querySelector('.cw-print-action')?.remove();
      summary.classList.add('tp-estimating'); summary.setAttribute('aria-busy','true');
      summary.replaceChildren(make('p','tp-note',t.calculating));
      try {
        const r=await routing.calculateDrive(from,to,{signal:request.signal});
        if(request.signal.aborted||signal.aborted)return;
        if(!Array.isArray(r.coordinates) || r.coordinates.length<2 || !Number.isFinite(r.distanceMeters) || r.distanceMeters<0) throw new Error('No route');
        options.showRoute?.({...r,home,school,direction:state.direction});
        const facts=make('dl','tp-route-facts');
        const measured=driveFacts(r,state.language);
        function fact(label,value) {const group=make('div');group.append(make('dt','',label),make('dd','',value));facts.append(group);}
        if(!measured)throw new Error('Invalid road estimate');
        fact(t.driveTime,measured.time);fact(t.distance,measured.distance);
        summary.replaceChildren(make('h2','tp-subheading',t.drive),facts,make('p','tp-fine',t.approximate));
        const language=state.language;
        const plan=commute.mountArrival({parent:tools,home,school,language,reverse,route:r});
        const print=printRouteButton(language,()=>confirmParentAction({
          language,heading:t.printHeading,message:t.printBody(home.address,school.name),confirmLabel:t.printConfirm,trigger:print,signal,
          onConfirm:()=>commute.printCard({home,school,language,reverse,route:r,links,shareURL:routeURL(home,school),
            bookingURL:parentBookingURL({schoolId:school.id,language}),plan:plan(),signal})
        }));
        print.setAttribute('aria-haspopup','dialog');actions.append(print);
        if(r.source){
          const line=make('p','tp-fine');line.append(t.sourcePrefix+' · ');
          const value=typeof r.source==='string'?r.source:r.source.name;
          const link=safeURL(r.sourceUrl||r.source?.url);
          if(value){line.append(link?externalLink(value,link):document.createTextNode(value));summary.append(line);}
        }
      }catch{
        if(signal.aborted||request.signal.aborted)return;
        options.clearRoute?.();
        summary.replaceChildren(make('h2','tp-subheading',t.drive),make('p','tp-note',t.unknownRoute));
        if(hasPoint(from) && hasPoint(to))summary.append(action(t.retry,'tp-link',estimate));
      }finally{
        signal.removeEventListener('abort',cancel);
        if(!signal.aborted && !request.signal.aborted){summary.classList.remove('tp-estimating');summary.removeAttribute('aria-busy');}
      }
    }
    if(state.autoRoute===false) summary.append(action(t.showRoute,'tp-primary',estimate));
    else estimate();
  }
  function mountComparison(parent,onSelectionCount) {
    commute.mountCompare({parent,home:state.home,school:state.school,language:state.language,showComparison:options.showComparison,onSelectionCount,
      reverse:state.direction==='return',getSchools,getSchool:options.getSchool,comparisonSaved:state.comparisonSaved,compare:state.compare,slots:state.slots,signal:scope.signal,
      chooseRoute:school=>{editing=null;focusKind='';go('route',{school:school.id});}});
  }
  function composer(parent) {
    const {home,school}=state;
    intro(parent,t.drive,t.directions);
    const fields=make('div','tp-endpoints');
    const reverse=state.direction==='return';
    fields.append(endpoint(reverse?'school':'home',true),endpoint(reverse?'home':'school',false));
    const swap=action('','tp-swap',()=>go('route',{dir:reverse?null:'return'}));
    swap.title=t.reverse;swap.setAttribute('aria-label',t.reverse);
    const symbol=make('span','', '⇅');symbol.setAttribute('aria-hidden','true');swap.append(symbol);
    fields.append(swap);parent.append(fields);
    if(school && !physicalSchool(school)){
      parent.append(make('p','tp-note',school.campusType==='virtual'?t.virtual:t.specialized));
      return;
    }
    if(home && school){ routeSummary(parent,home,school); return; }
    const guidance=make('p','tp-note',home?t.needSchool:school?t.needHome:t.chooseBoth);
    parent.append(guidance);
    if(home)mountComparison(parent,count=>{
      const message=count>=2?t.severalCompared:count===1?t.oneCompared:t.needSchool;
      if(guidance.textContent!==message)guidance.textContent=message;
    });
    if(!home && !school){
      const title=state.language==='es'?'Probar la ruta de Coconut Grove':'Try the Coconut Grove route';
      parent.append(action(title,'tp-secondary',()=>go('route',{home:'county-0141290000480',school:'fl-13-0841',dir:null})));
    }
    const links=make('div','tp-resources');
    links.append(externalLink(school?t.booking:t.operator,bookingLink(school,state.language),'tp-secondary'),externalLink(t.about,bookingLink(null,state.language,'website')));
    parent.append(links);
  }
  function render(next) {
    reset(); scope=new AbortController(); mounted=true;
    state={...next, language:(next.language || options.getLanguage?.())==='es'?'es':'en',
      home:typeof next.home==='string'?options.getHome?.(next.home):next.home,
      school:typeof next.school==='string'?options.getSchool?.(next.school):next.school};
    if(state.mode!=='route' || (editing && state[editing.kind]))editing=null;
    t=copy[state.language];
    const root=make('div','tp');root.lang=state.language;root.dataset.ownLanguage='';
    panel.replaceChildren(root);
    if(state.mode==='schools') {
      if(state.school)schoolProfile(root,state.school);
      else schoolDirectory(root);
    } else composer(root);
  }
  return {render,dispose:reset};
}
