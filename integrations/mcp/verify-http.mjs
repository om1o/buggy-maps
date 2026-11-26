import assert from 'node:assert/strict';
import {Client, StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {handlePublicMcp} from './http.mjs';
import descriptor from '../../dist/buggy/agent-tools.json' with {type: 'json'};

// With a URL, use the published HTTP service. Otherwise use the same fetch handler in process.
const endpoint = new URL(process.argv[2] ?? 'https://local.example/mcp');
const send = process.argv[2] ? fetch : handlePublicMcp;
const anonymousFetch = (input, init) => {
  const request = new Request(input, {...init, credentials: 'omit'});
  assert.ok(!['authorization', 'cookie', 'apikey'].some(name => request.headers.has(name)));
  return send(request);
};
const client = new Client({name: 'buggy-maps-http-test', version: '1.0.0'});
try {
  const probe = await anonymousFetch(endpoint, {method: 'OPTIONS', headers: {
    origin: 'https://reader.example', 'access-control-request-method': 'POST'
  }});
  assert.ok(probe.ok);
  assert.equal(probe.headers.get('access-control-allow-origin'), '*');
  await client.connect(new StreamableHTTPClientTransport(endpoint, {fetch: anonymousFetch}));
  const listing = await client.listTools();
  assert.deepEqual(listing.tools.map(tool => tool.name).sort(), descriptor['x-mcp'].tools.toSorted());
  async function call(name, args) {
    const result = await client.callTool({name, arguments: args});
    assert.ok(!result.isError, JSON.stringify(result.content));
    return result.structuredContent;
  }
  const {datasets} = await call('list_map_datasets', {});
  assert.deepEqual(datasets.map(item => item.name).sort(), Object.keys(descriptor['x-web'].dataDownloadsRelativeToDescriptor).sort());
  const {schools} = await call('search_schools', {query: 'Coconut Grove Elementary', limit: 3});
  assert.equal(schools[0].id, 'fl-13-0841');
  for (const language of ['en', 'es']) {
    const brief = await call('build_school_brief', {schoolIds: [schools[0].id], language});
    const url = new URL(brief.shareUrl);
    assert.equal(brief.schools[0].name, schools[0].name);
    assert.equal(url.origin + url.pathname, descriptor['x-web'].baseUrl);
    assert.deepEqual([...url.searchParams], [['mode', 'schools'], ['school', schools[0].id], ...(language === 'es' ? [['lang', 'es']] : [])]);
  }
  const invalid = await client.callTool({name: 'build_school_brief', arguments: {schoolIds: ['fl-13-9999']}});
  assert.equal(invalid.isError, true);
  console.log(`Anonymous HTTP client passed all three tools, ${datasets.length} catalog entries, EN/ES briefs and unknown-ID rejection.`);
} finally {
  await client.close();
}
