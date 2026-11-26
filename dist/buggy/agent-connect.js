import {setupLanguage} from './language.js';
import {writePublicLink} from './share-link.js';

const $ = id => document.getElementById(id);
const language = setupLanguage();
const t = (english, spanish) => language === 'es' ? spanish : english;
if (language === 'es') {
  const words = {
    skip: 'Saltar a los datos de conexión', back: 'Volver al mapa', title: 'Conecta un agente de IA',
    intro: 'Dale a tu asistente acceso a los registros públicos de escuelas de Miami-Dade y a los datos del mapa con el Protocolo de Contexto de Modelo (MCP).',
    connection: 'Conexión al servidor', setup: 'En tu cliente MCP, elige Streamable HTTP y pega la URL del servidor.',
    endpoint: 'URL del servidor', copy: 'Copiar URL', retry: 'Reintentar la carga', guide: 'Guía de conexión',
    catalog: 'Catálogo de herramientas (JSON)', example: 'Prueba una consulta en vivo',
    explain: 'Consulta los conjuntos de datos y las escuelas de Coconut Grove. Elige una escuela para preparar su ficha.',
    run: 'Buscar escuelas de Coconut Grove'
  };
  for (const node of document.querySelectorAll('[data-word]')) node.textContent = words[node.dataset.word];
  document.title = words.title + ' | Buggy Maps';
  $('back').href = './?lang=es';
  Object.assign($('language'), {href: '?lang=en', textContent: 'English', lang: 'en'});
}

const requestOptions = () => ({credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(12000)});
let endpoint;
let mapBase;
let session;
let version;
let sequence = 0;

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

async function rpc(method, params, notification = false) {
  const message = {jsonrpc: '2.0', method, params};
  if (!notification) message.id = ++sequence;
  const headers = {'Content-Type': 'application/json', Accept: 'application/json, text/event-stream'};
  if (version) headers['MCP-Protocol-Version'] = version;
  if (session) headers['Mcp-Session-Id'] = session;
  const response = await fetch(endpoint, {...requestOptions(), method: 'POST', headers, body: JSON.stringify(message)});
  if (notification && response.status === 202) return;
  if (!response.ok || notification) throw new Error('MCP request failed');
  const envelope = await readEnvelope(response, message.id);
  if (envelope.jsonrpc !== '2.0' || envelope.id !== message.id || envelope.error || !envelope.result) throw new Error('Invalid response');
  if (method === 'initialize') session = response.headers.get('Mcp-Session-Id');
  return envelope.result;
}

async function tool(name, args) {
  const result = await rpc('tools/call', {name, arguments: args});
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
    const brief = await tool('build_school_brief', {schoolIds: [school.id], language});
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
    session = null; version = null;
    const hello = await rpc('initialize', {protocolVersion: '2025-11-25', capabilities: {}, clientInfo: {name: 'buggy-maps-connection-page', version: '1.0'}});
    if (!['2025-11-25', '2025-06-18', '2025-03-26'].includes(hello.protocolVersion)) throw new Error('Unsupported protocol');
    version = hello.protocolVersion;
    await rpc('notifications/initialized', {}, true);
    const datasets = await tool('list_map_datasets', {});
    renderDatasets(datasets.datasets);
    $('example-status').textContent = t('Finding Coconut Grove schools…', 'Buscando escuelas de Coconut Grove…');
    const result = await tool('search_schools', {query: 'Coconut Grove', limit: 5, language});
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
