import {readFile} from 'node:fs/promises';
import {McpServer} from '@modelcontextprotocol/server';
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import * as z from 'zod/v4';
import {validateDataset} from '../../dist/buggy/data-loader.js';
import {buildSchoolBrief, searchBriefSchools} from '../../dist/buggy/school-brief.js';
import {createSchoolDirectory} from '../../dist/buggy/school-mode.js';

const app = new URL('../../dist/buggy/', import.meta.url);
const descriptor = JSON.parse(await readFile(new URL('agent-tools.json', app), 'utf8'));
const web = descriptor['x-web'];
const directory = createSchoolDirectory(async () => {
  try {
    const json = await readFile(new URL(web.localDirectoryRelativeToDescriptor, app), 'utf8');
    return validateDataset('data/schools.json', JSON.parse(json));
  } catch {
    throw new Error('Restore dist/buggy/data/schools.json from the Buggy Maps checkout.');
  }
});

const datasets = Object.entries(web.dataDownloadsRelativeToDescriptor).map(([name, path]) => {
  const base = path.endsWith('/') ? web.repository + '/tree/main/dist/buggy/' : web.rawBaseUrl;
  return {name, siteUrl: new URL(path, web.baseUrl).href, githubUrl: new URL(path, base).href};
});

const language = z.enum(['en', 'es']).default('en');
const readOnly = {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false};
const response = value => ({structuredContent: value, content: [{type: 'text', text: JSON.stringify(value)}]});
const resultSchema = name => z.fromJSONSchema({...descriptor.$defs[name], $defs: descriptor.$defs});

function createServer() {
  const server = new McpServer({name: 'buggy-maps', version: '1.0.0'});
  server.registerTool('list_map_datasets', {
    description: 'List public Buggy Maps datasets, attribution files and the research archive with website and GitHub links.',
    inputSchema: z.strictObject({}),
    outputSchema: z.object({datasets: z.array(z.object({name: z.string(), siteUrl: z.url(), githubUrl: z.url()}))}),
    annotations: readOnly
  }, () => response({datasets}));
  server.registerTool('search_schools', {
    description: 'Find physical Miami-Dade campus candidates by school name, alias or ZIP. Return up to 20 public records for the user to choose from.',
    inputSchema: z.strictObject({query: z.string().trim().min(1), limit: z.number().int().min(1).max(20).default(6), language}),
    outputSchema: resultSchema('searchResult'),
    annotations: readOnly
  }, async ({query, limit, language}) => {
    await directory.load();
    return response({language, schools: searchBriefSchools(directory, query, limit)});
  });
  server.registerTool('build_school_brief', {
    description: 'Build a school-only map link from one to three campus IDs explicitly chosen by the user, in their chosen order. Include public school facts and the district locator.',
    inputSchema: z.strictObject({schoolIds: z.array(z.string().min(1).max(80)).min(1).max(3), language}),
    outputSchema: resultSchema('briefResult'),
    annotations: readOnly
  }, async ({schoolIds, language}) => {
    await directory.load();
    return response(buildSchoolBrief(schoolIds, directory, language));
  });
  return server;
}

await serveStdio(createServer);
