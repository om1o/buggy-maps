import assert from 'node:assert/strict';
import {readFile, stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {Client} from '@modelcontextprotocol/client';
import {StdioClientTransport} from '@modelcontextprotocol/client/stdio';

const app = new URL('../../dist/buggy/', import.meta.url);
const descriptor = JSON.parse(await readFile(new URL('agent-tools.json', app), 'utf8'));
const web = descriptor['x-web'];
const server = fileURLToPath(new URL('server.mjs', import.meta.url));
const client = new Client({name: 'buggy-maps-stdio-test', version: '1.0.0'});
const transport = new StdioClientTransport({command: process.execPath, args: [server], cwd: tmpdir()});
let calls = 0;
async function call(name, args) {
  const result = await client.callTool({name, arguments: args});
  assert.ok(!result.isError, JSON.stringify(result.content));
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  calls++;
  return result.structuredContent;
}
async function expectError(name, args) {
  try {
    const result = await client.callTool({name, arguments: args});
    assert.equal(result.isError, true, 'invalid input succeeded');
    assert.ok(result.content.some(item => item.type === 'text' && item.text.length));
  } catch (error) {
    // Clients may reject schema-invalid arguments locally or with InvalidParams.
    assert.ok(error.code === -32602 || error.code === -32601, String(error));
  }
  calls++;
}

try {
  await client.connect(transport);
  const {tools} = await client.listTools();
  assert.deepEqual(tools.map(t => t.name).sort(), descriptor['x-mcp'].tools.toSorted());
  for (const tool of tools) {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.outputSchema.type, 'object');
  }
  const {datasets} = await call('list_map_datasets', {});
  assert.deepEqual(datasets.map(row => row.name).sort(), Object.keys(web.dataDownloadsRelativeToDescriptor).sort());
  for (const {name, siteUrl, githubUrl} of datasets) {
    const path = web.dataDownloadsRelativeToDescriptor[name];
    const folder = (await stat(new URL(path, app))).isDirectory();
    assert.equal(siteUrl, new URL(path, web.baseUrl).href);
    const root = folder ? 'https://github.com/om1o/buggy-maps/tree/main/dist/buggy/' : 'https://raw.githubusercontent.com/om1o/buggy-maps/main/dist/buggy/';
    assert.equal(githubUrl, new URL(path, root).href);
    assert.equal(new URL(githubUrl).search, '');
  }
  const grove = 'fl-13-0841', ponce = 'fl-13-6741';
  for (const language of ['en', 'es']) {
    const result = await call('search_schools', {query: language === 'en' ? 'Coconut Grove Elementary' : 'primaria Coconut Grove', limit: 2, language});
    assert.equal(result.language, language);
    assert.equal(result.schools[0].id, grove);
    const {schools, shareUrl, districtLocator} = await call('build_school_brief', {schoolIds: [ponce, grove], language});
    assert.deepEqual(schools.map(s => s.id), [ponce, grove]);
    assert.deepEqual(schools.map(s => s.grades), ['6-8', 'PK-5']);
    assert.equal(districtLocator, web.districtLocator);
    const url = new URL(shareUrl);
    assert.equal(url.origin + url.pathname, web.baseUrl);
    assert.equal(url.hash, '');
    assert.deepEqual([...url.searchParams], [['mode', 'schools'], ['campuses', ponce + ',' + grove], ...(language === 'es' ? [['lang', 'es']] : [])]);
  }
  assert.deepEqual((await call('search_schools', {query: 'AbsentCampusForTesting'})).schools, []);
  assert.equal((await call('search_schools', {query: '33133', limit: 1})).schools.length, 1);
  assert.equal((await call('build_school_brief', {schoolIds: [grove]})).shareUrl, web.singleExample);
  const {homes} = await call('search_homes', {zip: '33135', minPrice: 349000, maxPrice: 349000});
  assert.deepEqual(homes.map(home => home.id), ['zillow-43838862']);
  const nearby = await call('compare_nearby_schools', {homeIds: [homes[0].id], limit: 1});
  assert.equal(nearby.comparisons[0].schools[0].id, 'fl-private-13-6697');
  await expectError('build_school_brief', {schoolIds: ['fl-13-9999']});
  await expectError('build_school_brief', {schoolIds: [grove, grove]});
  await expectError('build_school_brief', {schoolIds: []});
  await expectError('search_schools', {query: '33133', limit: 21});
  await expectError('search_schools', {query: '33133', home: 'private'});
  await expectError('absent_tool', {});
  console.log(`Official MCP stdio handshake, ${tools.length} tool schemas, ${datasets.length} dataset links and ${calls} calls verified.`);
} finally {
  await client.close();
}
