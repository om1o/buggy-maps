import {createMcpHandler} from '@modelcontextprotocol/server';
import descriptor from '../../dist/buggy/agent-tools.json' with {type: 'json'};
import snapshot from '../../dist/buggy/data/schools.json' with {type: 'json'};
import {schoolServerFactory} from './tools.mjs';

const env = name => globalThis.Deno?.env.get(name) ?? globalThis.process?.env?.[name];
const mcp = createMcpHandler(schoolServerFactory(descriptor, () => snapshot, {
  dataset: env('BUGGY_BRIDGE_DATASET'), token: env('BUGGY_BRIDGE_SERVER_TOKEN')
}), {
  maxRequestBodySize: 65536
});

function validBrowserOrigin(origin) {
  if (origin === null) return true;
  try {
    const url = new URL(origin);
    return url.origin === origin && (url.protocol === 'https:' ||
      (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)));
  } catch {
    return false;
  }
}

export async function handlePublicMcp(request) {
  if (!validBrowserOrigin(request.headers.get('origin'))) {
    return new Response('Invalid browser origin.', {status: 403});
  }
  const response = request.method === 'OPTIONS'
    ? new Response(null, {status: 204})
    : await mcp.fetch(request);
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', '*');
  headers.set('Access-Control-Expose-Headers', 'MCP-Protocol-Version, MCP-Session-Id');
  headers.set('Cache-Control', 'no-store');
  return new Response(response.body, {status: response.status, headers});
}
