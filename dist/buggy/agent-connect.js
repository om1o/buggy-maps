import {setupLanguage} from './language.js';
import {writePublicLink} from './share-link.js';

const $ = id => document.getElementById(id);
const language = setupLanguage();
const t = (english, spanish) => language === 'es' ? spanish : english;
if (language === 'es') {
  const words = {
    skip: 'Saltar a los datos de conexión', back: 'Volver al mapa', title: 'Conecta un agente de IA',
    intro: 'Dale a tu asistente acceso a los precios históricos de viviendas de Miami-Dade, los registros escolares y los datos del mapa con el Protocolo de Contexto de Modelo (MCP).',
    connection: 'Conexión al servidor', setup: 'En tu cliente MCP, elige Streamable HTTP y pega la URL del servidor.',
    endpoint: 'URL del servidor', copy: 'Copiar URL', retry: 'Reintentar la carga', guide: 'Guía de conexión',
    catalog: 'Catálogo de herramientas (JSON)', example: 'Prueba una consulta en vivo',
    explain: 'Consulta los conjuntos de datos y las escuelas de Coconut Grove. Elige una escuela para preparar su ficha.',
    run: 'Buscar escuelas de Coconut Grove', homes: 'Comparar viviendas y escuelas cercanas',
    homeIntro: 'Busca por código postal y precio máximo anunciado. Compara las tres escuelas del mapa más cercanas a cada una de las dos viviendas de menor precio.',
    zip: 'Código postal', max: 'Precio máximo anunciado (USD)', compare: 'Comparar las dos primeras viviendas'
  };
  for (const node of document.querySelectorAll('[data-word]')) node.textContent = words[node.dataset.word];
  document.title = words.title + ' | Buggy Maps';
  $('back').href = './?lang=es';
  Object.assign($('language'), {href: '?lang=en', textContent: 'English', lang: 'en'});
}

function requestOptions(signal, timeoutMs = 12000) {
  const timeout = AbortSignal.timeout(timeoutMs);
  return {credentials: 'omit', referrerPolicy: 'no-referrer', signal: signal ? AbortSignal.any([signal, timeout]) : timeout};
}
let endpoint;
let mapBase;
let schoolClient;
let homeRequest;

function publicURL(value) {
  const url = new URL(value);
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.username || url.password) throw new Error('Invalid URL');
  return url;
}

async function configure() {
  $('retry').hidden = true;
  $('connection-status').textContent = t('Loading connection details…', 'Cargando la conexión…');
  try {
    const response = await fetch('./agent-tools.json', requestOptions());
    if (!response.ok) throw new Error('Descriptor unavailable');
    const descriptor = await response.json();
    if (descriptor['x-mcp']?.transport !== 'streamable-http' || !descriptor['x-mcp'].url) throw new Error('Endpoint unavailable');
    endpoint = publicURL(new URL(descriptor['x-mcp'].url, response.url)).href;
    mapBase = publicURL(descriptor['x-web'].baseUrl);
    $('endpoint').value = endpoint;
    $('copy').disabled = false;
    $('run-example').disabled = false;
    $('home-run').disabled = false;
    $('connection-status').textContent = '';
  } catch {
    $('connection-status').textContent = t('Connection details are unavailable. Try again or open the setup guide.', 'No se pudieron cargar los datos de conexión. Reintenta o abre la guía.');
    $('retry').hidden = false;
  }
}

async function readEnvelope(response, id) {
  if (!response.headers.get('Content-Type')?.toLowerCase().startsWith('text/event-stream')) return response.json();
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let bytes = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) throw new Error('No matching response in stream');
      bytes += value.byteLength;
      if (bytes > 256 * 1024) throw new Error('Response too large');
      buffer += decoder.decode(value, {stream: true});
      let boundary;
      while ((boundary = /\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary[0].length);
        const data = frame.split(/\r\n|\n|\r/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n');
        if (!data) continue;
        const message = JSON.parse(data);
        if (message.id === id) return message;
      }
    }
  } finally { await reader.cancel().catch(() => {}); }
}

async function rpc(client, method, params, notification = false) {
  const message = {jsonrpc: '2.0', method, params};
  if (!notification) message.id = ++client.sequence;
  const headers = {'Content-Type': 'application/json', Accept: 'application/json, text/event-stream'};
  if (client.version) headers['MCP-Protocol-Version'] = client.version;
  if (client.session) headers['Mcp-Session-Id'] = client.session;
  const timeoutMs = method === 'tools/call' && params.name === 'check_home_facts' ? 22000 : 12000;
  const response = await fetch(endpoint, {...requestOptions(client.signal, timeoutMs), method: 'POST', headers, body: JSON.stringify(message)});
  if (notification && response.status === 202) return;
  if (!response.ok || notification) throw new Error('MCP request failed');
  const envelope = await readEnvelope(response, message.id);
  if (envelope.jsonrpc !== '2.0' || envelope.id !== message.id || envelope.error || !envelope.result) throw new Error('Invalid response');
  if (method === 'initialize') client.session = response.headers.get('Mcp-Session-Id');
  return envelope.result;
}

async function connect(signal) {
  const client = {sequence: 0, signal};
  const hello = await rpc(client, 'initialize', {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 'buggy-maps-connection-page', version: '1.0'}});
  if (!['2025-11-25', '2025-06-18', '2025-03-26'].includes(hello.protocolVersion)) throw new Error('Unsupported protocol');
  client.version = hello.protocolVersion;
  await rpc(client, 'notifications/initialized', {}, true);
  return client;
}

async function tool(client, name, args) {
  const result = await rpc(client, 'tools/call', {name, arguments: args});
  if (result.isError) throw new Error('Tool failed');
  return result.structuredContent ?? JSON.parse(result.content.find(item => item.type === 'text').text);
}

function element(tag, text) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  return node;
}

function renderDatasets(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('Invalid datasets');
  const details = element('details');
  details.append(element('summary', t('Available datasets', 'Conjuntos de datos disponibles') + ' (' + rows.length + ')'));
  const list = element('ul');
  for (const row of rows) {
    const url = publicURL(row.siteUrl);
    if (url.origin !== mapBase.origin) throw new Error('Invalid dataset URL');
    const li = element('li');
    const a = element('a', row.name.replace(/([a-z])([A-Z])/g, '$1 $2'));
    a.href = url.href;
    li.append(a); list.append(li);
  }
  details.append(list); $('datasets').replaceChildren(details);
}

function enableExample(enabled) {
  $('run-example').disabled = !enabled;
  for (const button of $('school-options').querySelectorAll('button')) button.disabled = !enabled;
}

async function buildExample(school) {
  enableExample(false);
  $('sample-brief').hidden = true;
  $('example-status').textContent = t('Preparing the school brief…', 'Preparando la ficha escolar…');
  try {
    const brief = await tool(schoolClient, 'build_school_brief', {schoolIds: [school.id], language});
    const row = brief.schools?.[0];
    const url = publicURL(brief.shareUrl);
    if (brief.schools.length !== 1 || row.id !== school.id || !row.name ||
        url.origin !== mapBase.origin || url.pathname !== mapBase.pathname || url.hash ||
        url.searchParams.get('mode') !== 'schools' || url.searchParams.get('school') !== row.id ||
        [...url.searchParams.keys()].some(key => !['mode', 'school', 'lang'].includes(key)) ||
        ['mode', 'school', 'lang'].some(key => url.searchParams.getAll(key).length > 1) ||
        (url.searchParams.has('lang') && url.searchParams.get('lang') !== language)) throw new Error('Invalid school brief');
    const title = element('h3', row.name);
    title.tabIndex = -1;
    const text = [row.grades && t('Grades ', 'Grados ') + row.grades, [row.address, row.city, row.state, row.zip].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
    const a = element('a', t('Open school-only map', 'Abrir mapa solo de la escuela'));
    a.href = url.href;
    $('sample-brief').replaceChildren(title, element('p', text), a);
    $('sample-brief').hidden = false;
    $('example-status').textContent = t('School brief received.', 'Ficha escolar recibida.');
    title.focus();
  } catch {
    $('example-status').textContent = t('The server could not return this brief. Run the example again.', 'El servidor no pudo devolver la ficha. Vuelve a iniciar la consulta.');
  } finally { enableExample(true); }
}

async function runExample() {
  enableExample(false);
  $('datasets').replaceChildren(); $('school-options').replaceChildren(); $('sample-brief').hidden = true;
  $('example-status').textContent = t('Connecting to the server…', 'Conectando al servidor…');
  try {
    schoolClient = await connect();
    const datasets = await tool(schoolClient, 'list_map_datasets', {});
    renderDatasets(datasets.datasets);
    $('example-status').textContent = t('Finding Coconut Grove schools…', 'Buscando escuelas de Coconut Grove…');
    const result = await tool(schoolClient, 'search_schools', {query: 'Coconut Grove', limit: 5, language});
    if (!Array.isArray(result.schools)) throw new Error('Invalid schools');
    for (const school of result.schools) {
      const li = element('li');
      const button = element('button', school.name);
      button.type = 'button';
      button.addEventListener('click', () => buildExample(school));
      li.append(button); $('school-options').append(li);
    }
    $('example-status').textContent = result.schools.length ? t('Choose a school for the brief.', 'Elige una escuela para la ficha.') : t('No matching schools were returned.', 'La búsqueda no devolvió escuelas.');
  } catch {
    $('example-status').textContent = t('The live request could not finish. Try again or check the setup guide.', 'No se pudo completar la consulta. Reintenta o revisa la guía.');
  } finally { enableExample(true); }
}

function sourceLink(label, url) {
  const link = element('a', label);
  link.href = publicURL(url).href;
  return link;
}

const locale = t('en-US', 'es-US');
const usd = new Intl.NumberFormat(locale, {style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2});
const miles = new Intl.NumberFormat(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2});
const schoolTypes = {Public: 'Pública', Private: 'Privada', Charter: 'Chárter'};
const statuses = {Active: 'En venta', Pending: 'Venta pendiente', 'Active Under Contract': 'En venta bajo contrato', 'Coming Soon': 'Próximamente en venta'};
const bands = {elementary: t('Elementary', 'Primaria'), middle: t('Middle', 'Secundaria básica'), high: t('High', 'Secundaria superior')};
const unverified = t('Unverified', 'Sin verificar');
const dateOnly = new Intl.DateTimeFormat(locale, {dateStyle: 'medium', timeZone: 'UTC'});
const dateAndTime = new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric',
  minute: '2-digit', timeZone: 'America/New_York', timeZoneName: 'short'});

function dateLine(label, value) {
  const when = new Date(value);
  if (!value || !Number.isFinite(when.getTime())) throw new Error('Missing source date');
  const time = element('time', (value.length === 10 ? dateOnly : dateAndTime).format(when));
  time.dateTime = value;
  const line = element('p', label + ' ');
  line.append(time);
  return line;
}

function listingFact(label, field, value) {
  const block = element('div');
  const verified = field.verification === 'verified';
  if (verified && (!value || !field.checkedAt || !field.sourceUpdatedAt || !field.sourceUrl)) throw new Error('Missing listing evidence');
  block.append(element('h5', label), element('p', verified ? value : unverified));
  if (field.reason === 'provider_not_configured') block.append(element('p', t('Live MLS access is unavailable.', 'El acceso en vivo al MLS no está disponible.')));
  if (field.reason === 'provider_unavailable') block.append(element('p', t('The MLS could not complete the check.', 'El MLS no pudo completar la consulta.')));
  if (field.reason === 'ambiguous_listings' || field.reason === 'no_exact_current_listing') block.append(element('p', t('The MLS could not identify one current listing for this address.', 'El MLS no pudo identificar un único anuncio actual para esta dirección.')));
  if (field.reason === 'listing_not_active') block.append(element('p', t('The MLS did not report an active listing.', 'El MLS no indicó que el anuncio estuviera activo.')));
  if (field.checkedAt) block.append(dateLine(t('MLS check', 'Consulta al MLS'), field.checkedAt));
  if (field.sourceUpdatedAt) block.append(dateLine(t('MLS record updated', 'Actualización del registro MLS'), field.sourceUpdatedAt));
  if (field.sourceUrl) block.append(sourceLink(t('MLS record (licensed access)', 'Registro MLS (acceso con licencia)'), field.sourceUrl));
  return block;
}

function renderCheck(home, result) {
  const {listing, schoolAssignment: district} = result;
  if (result.home?.id !== home.id || result.home.address !== home.address || result.home.zip !== home.zip ||
    district.homeId !== home.id || !Array.isArray(district.bands) ||
    district.bands.length !== 3 || new Set(district.bands.map(b => b.band)).size !== 3) throw new Error('Unexpected home facts');
  const status = listing.saleStatus.value;
  const amount = listing.askingPriceUsd.value;
  const content = document.createDocumentFragment();
  content.append(dateLine(t('Check requested', 'Consulta solicitada'), result.checkedAt),
    listingFact(t('Current listing status', 'Estado actual del anuncio'), listing.saleStatus, Object.hasOwn(statuses, status) && t(status, statuses[status])),
    listingFact(t('Current asking price', 'Precio anunciado actual'), listing.askingPriceUsd,
      listing.saleStatus.verification === 'verified' && status === 'Active' && Number.isFinite(amount) && amount > 0 ? usd.format(amount) : null));
  if (listing.listingId) content.append(element('p', ['MLS ' + listing.listingId, listing.listingOffice].filter(Boolean).join(' · ')));
  content.append(sourceLink(t('Public MLS search', 'Buscador público del MLS'), listing.publicSearchUrl),
    element('h5', t('Attendance zones', 'Zonas de asistencia escolar')),
    dateLine(t('Boundary check', 'Consulta de zonas'), district.checkedAt),
    sourceLink(t('County address source', 'Fuente de direcciones del condado'), district.addressSourceUrl));
  if (district.addressStatus === 'unverified') content.append(element('p', t('The county could not confirm this exact address.', 'El condado no pudo confirmar esta dirección exacta.')));
  const list = element('ul');
  for (const band of district.bands) {
    if (!Object.hasOwn(bands, band.band)) throw new Error('Unexpected grade band');
    const item = element('li');
    item.append(element('strong', bands[band.band]));
    if (band.status === 'matched') {
      if (!band.schoolName || !band.schoolYear || !band.sourceDate || !band.evidenceUrl) throw new Error('Missing boundary evidence');
      item.append(element('div', [band.schoolName, band.grades && t('Grades ', 'Grados ') + band.grades, band.schoolYear].filter(Boolean).join(' · ')));
    } else {
      item.append(element('div', unverified));
    }
    if (band.sourceDate) item.append(dateLine(t('Boundary edition', 'Edición de la zona'), band.sourceDate));
    item.append(sourceLink(t('County boundary source', 'Fuente del condado'), band.evidenceUrl || band.sourceUrl));
    list.append(item);
  }
  content.append(list, element('p', t('Enrollment is unverified. Confirm placement and any exceptions with Miami-Dade County Public Schools.',
    'La matrícula está sin verificar. Confirma la asignación y cualquier excepción con las Escuelas Públicas del Condado de Miami-Dade.')),
    sourceLink(t('District attendance locator', 'Buscador de zonas escolares del distrito'), district.districtLocator));
  return content;
}

function checkPanel(home, client) {
  const panel = element('div');
  const button = element('button', t('Check listing and school zones', 'Verificar anuncio y zonas escolares'));
  button.type = 'button';
  button.setAttribute('aria-label', button.textContent + ' · ' + home.address);
  const status = element('p');
  status.setAttribute('role', 'status');
  const result = element('section');
  result.hidden = true;
  result.id = 'facts-' + home.id;
  button.setAttribute('aria-controls', result.id);
  button.addEventListener('click', async () => {
    if (button.getAttribute('aria-disabled') === 'true') return;
    button.setAttribute('aria-disabled', 'true');
    result.hidden = true;
    status.textContent = t('Checking this address…', 'Verificando esta dirección…');
    try {
      const response = await tool(client, 'check_home_facts', {homeId: home.id});
      if (!panel.isConnected) return;
      const title = element('h4', t('Address verification', 'Verificación de la dirección'));
      title.id = result.id + '-title';
      title.tabIndex = -1;
      result.setAttribute('aria-labelledby', title.id);
      result.replaceChildren(title, renderCheck(home, response));
      result.hidden = false;
      status.textContent = t('Check complete.', 'Consulta completada.');
      if (document.activeElement === button) title.focus();
    } catch {
      status.textContent = t('The check could not finish. Try again.', 'No se pudo completar la verificación. Inténtalo de nuevo.');
    } finally { button.removeAttribute('aria-disabled'); }
  });
  panel.append(button, status, result);
  return panel;
}

function homeCard({home, schools, locationStatus}, client) {
  const card = element('article');
  card.className = 'home-card';
  const address = element('h3', home.address);
  const place = element('p', [home.city, home.state, home.zip].filter(Boolean).join(' '));
  const price = element('p');
  const date = element('time', home.observedOn);
  date.dateTime = home.observedOn;
  price.append(element('strong', usd.format(home.askingPriceUsd)), document.createTextNode(t(' asking price on ', ' anunciado el ')), date);
  card.append(address, place, price, sourceLink(t('Archived listing source', 'Fuente del anuncio histórico'), home.sourceUrl));
  if (!schools.length) {
    const missing = locationStatus === 'unavailable'
      ? t('This home has no verified map position.', 'Esta vivienda carece de una ubicación verificada en el mapa.')
      : t('No mapped schools were returned.', 'No se encontraron escuelas en el mapa.');
    card.append(element('p', missing), checkPanel(home, client));
    return card;
  }
  const list = element('ol');
  for (const school of schools) {
    const item = element('li');
    const type = t(school.type, schoolTypes[school.type] || school.type);
    const facts = [type, school.grades && t('Grades ', 'Grados ') + school.grades,
      miles.format(school.distanceMiles) + t(' mi straight-line', ' mi en línea recta')];
    item.append(sourceLink(school.name, school.sourceUrl), element('div', facts.filter(Boolean).join(' · ')));
    list.append(item);
  }
  card.append(element('h4', t('Nearby schools', 'Escuelas cercanas')), list, checkPanel(home, client));
  return card;
}

function clearHomes() {
  homeRequest?.abort();
  homeRequest = null;
  $('home-status').textContent = '';
  $('home-results').replaceChildren();
  $('home-run').disabled = !endpoint;
}

async function runHomes(event) {
  event.preventDefault();
  clearHomes();
  const controller = new AbortController();
  homeRequest = controller;
  $('home-run').disabled = true;
  $('home-status').textContent = t('Finding archived homes…', 'Buscando viviendas en el archivo…');
  const zip = $('home-zip').value;
  const maxPrice = $('home-max').valueAsNumber;
  try {
    const client = await connect(controller.signal);
    const search = await tool(client, 'search_homes', {zip, maxPrice, limit: 2});
    if (controller.signal.aborted) return;
    if (search.priceBasis !== 'archived_asking_usd' || !Array.isArray(search.homes) || search.homes.length > 2) throw new Error('Unexpected search result');
    if (!search.homes.length) {
      $('home-status').textContent = t('No archived asking prices match these filters.', 'No hay precios anunciados en el archivo que coincidan con estos filtros.');
      return;
    }
    $('home-status').textContent = t('Finding nearby schools…', 'Buscando escuelas cercanas…');
    const homeIds = search.homes.map(home => home.id);
    const result = await tool(client, 'compare_nearby_schools', {homeIds, limit: 3});
    if (controller.signal.aborted) return;
    if (result.distanceBasis !== 'straight_line_miles' || result.comparisons.length !== homeIds.length ||
      result.comparisons.some((row, i) => row.home.id !== homeIds[i])) throw new Error('Unexpected comparison');
    const cards = element('div');
    cards.className = 'home-cards';
    cards.append(...result.comparisons.map(row => homeCard(row, client)));
    const note = element('p', t('Confirm current prices and availability with the listing source. Check enrollment and attendance boundaries with the district.',
      'Confirma el precio actual y la disponibilidad con la fuente del anuncio. Consulta los requisitos de matrícula y los límites de asistencia con el distrito.'));
    $('home-results').replaceChildren(cards, note, sourceLink(t('District attendance locator', 'Buscador de zonas escolares del distrito'), result.districtLocator));
    $('home-status').textContent = t('Homes shown', 'Viviendas mostradas') + ' (' + homeIds.length + t(' of ', ' de ') + search.totalMatches + ').';
  } catch {
    if (!controller.signal.aborted) $('home-status').textContent = t('The comparison could not finish. Try again.', 'No se pudo completar la comparación. Vuelve a intentarlo.');
  } finally {
    if (homeRequest === controller) $('home-run').disabled = false;
  }
}

$('home-form').addEventListener('input', clearHomes);
$('home-form').addEventListener('submit', runHomes);
$('copy').addEventListener('click', async () => {
  if (await writePublicLink(endpoint)) $('connection-status').textContent = t('URL copied.', 'URL copiada.');
  else {
    $('endpoint').focus(); $('endpoint').select();
    $('connection-status').textContent = t('Select and copy the server URL.', 'Selecciona y copia la URL del servidor.');
  }
});
$('retry').addEventListener('click', configure);
$('run-example').addEventListener('click', runExample);
configure();
