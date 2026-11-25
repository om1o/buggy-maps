// A school or directory URL can be copied from the address bar. The working
// home and trip stay on the current history entry, including after a reload.
const localKey = 'buggyLocalMapV1';
const linkIntents = new WeakMap();
const directorySchoolId = /^(?:fl-(?:private-)?\d{2}-\d{4}|nces-\d{12}|campus-[a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function isDirectorySchoolId(id) {
  return typeof id === 'string' && id.length <= 80 && directorySchoolId.test(id);
}

function preferences(from, to) {
  const language = from.get('lang');
  if (language === 'en' || language === 'es') to.set('lang', language);
  if (from.get('layer') === 'aerial') to.set('layer', 'aerial');
  return to;
}

function onlyCampuses(params) {
  const ids = [...new Set((params.get('campuses') || '').slice(0,1024)
    .split(',').map(id => id.trim().toLowerCase()).filter(isDirectorySchoolId))].slice(0,3);
  return preferences(params, new URLSearchParams({mode:'schools', campuses:ids.join(',')}));
}

function includesHome(params) {
  return ['home','map','property','q','area'].some(key => params.has(key));
}

export function publicMapParams(input) {
  const params = new URLSearchParams(input);
  if (params.has('campuses')) return onlyCampuses(params);
  if (!includesHome(params)) {
    if (params.has('school')) {
      const school = params.get('school');
      if (isDirectorySchoolId(school)) params.set('school',school);
      else params.delete('school');
    }
    return params;
  }
  const safe = new URLSearchParams();
  const school = params.get('school');
  if (isDirectorySchoolId(school)) {
    safe.set('mode','schools');
    safe.set('school',school);
  } else if (params.get('mode') === 'schools' || params.get('mode') === 'route') {
    safe.set('mode',params.get('mode'));
  }
  return preferences(params,safe);
}

// Ignore a stale history entry if its public destination no longer matches.
// Language and map style can change independently while the same page is open.
function sameDestination(left, right) {
  const comparable = params => {
    const copy = new URLSearchParams(params);
    copy.delete('lang'); copy.delete('layer'); copy.sort();
    return copy.toString();
  };
  return comparable(left) === comparable(right);
}

export function currentMapParams(search=location.search, state=history.state) {
  const visible = new URLSearchParams(search);
  if (visible.has('campuses')) return onlyCampuses(visible);
  const entry = state?.[localKey];
  if (typeof entry !== 'string') return visible;
  const local = new URLSearchParams(entry);
  if (!sameDestination(visible,publicMapParams(local))) return visible;
  local.delete('lang'); local.delete('layer');
  return preferences(visible,local);
}

export function setMapHref(anchor, input) {
  const params = new URLSearchParams(input);
  const safe = publicMapParams(params).toString();
  anchor.setAttribute('href', safe ? '?' + safe : './');
  linkIntents.set(anchor,params);
}

export function intentForMapLink(anchor, fallback) {
  return new URLSearchParams(linkIntents.get(anchor) || fallback);
}

export function writeMapLocation(input,{replace=false,hash=''}={}) {
  const params = new URLSearchParams(input);
  const safe = publicMapParams(params);
  const query = safe.toString();
  const target = location.pathname + (query ? '?' + query : '') + hash;
  const local = !params.has('campuses') && includesHome(params) ? params.toString() : null;
  const previous = history.state;
  if (target === location.pathname + location.search + location.hash &&
      (previous?.[localKey] ?? null) === local) return;
  const state = replace ? {...previous} : {};
  if (local === null) delete state[localKey]; else state[localKey] = local;
  history[replace ? 'replaceState' : 'pushState'](state,'',target);
}

export function replaceMapLocation(params) {
  writeMapLocation(params,{replace:true,hash:location.hash});
}

// Record explicit edits on this route's history entry without navigating.
// An empty compare value distinguishes a cleared list from an unopened one.
export function rememberLocalComparison(homeId, choices) {
  const params = currentMapParams();
  if (typeof history.state?.[localKey] !== 'string' || !homeId ||
      params.get('mode') !== 'route' || params.get('home') !== homeId) return null;
  if (!Array.isArray(choices) || choices.length > 3) return null;
  const ids = new Set(), positions = new Set();
  for (const choice of choices) {
    if (!isDirectorySchoolId(choice?.id) || ids.has(choice.id) ||
        !Number.isInteger(choice.position) || choice.position < 0 || choice.position > 2 ||
        positions.has(choice.position)) return null;
    ids.add(choice.id);
    positions.add(choice.position);
  }
  const ordered = [...choices].sort((a,b) => a.position - b.position);
  params.set('compare',ordered.map(choice => choice.id).join(','));
  if (ordered.some((choice,i) => choice.position !== i)) {
    params.set('slots',ordered.map(choice => choice.position + 1).join(','));
  } else {
    params.delete('slots');
  }
  replaceMapLocation(params);
  return params;
}

// Legacy and parent-authorized links remain usable. Once opened, the route is
// restored locally and the browser's own Share action offers a safe address.
export function protectIncomingMapLocation() {
  const params = new URLSearchParams(location.search);
  if (params.has('campuses')) {
    writeMapLocation(onlyCampuses(params),{replace:true});
  } else if (includesHome(params)) {
    writeMapLocation(params,{replace:true,hash:location.hash === '#coverage-details' ? location.hash : ''});
  } else if (params.has('school') &&
      (!isDirectorySchoolId(params.get('school')) || params.getAll('school').length > 1)) {
    writeMapLocation(publicMapParams(params),{replace:true});
  }
}
