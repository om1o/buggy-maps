import {McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {validateDataset} from '../../dist/buggy/data-loader.js';
import {buildSchoolBrief, searchBriefSchools} from '../../dist/buggy/school-brief.js';
import {createSchoolDirectory} from '../../dist/buggy/school-mode.js';

const language = z.enum(['en', 'es']).default('en');
const readOnly = {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false};
const response = value => ({structuredContent: value, content: [{type: 'text', text: JSON.stringify(value)}]});

export function schoolServerFactory(descriptor, loadSnapshot) {
  const web = descriptor['x-web'];
  const directory = createSchoolDirectory(async () => validateDataset('data/schools.json', await loadSnapshot()));
  const resultSchema = name => z.fromJSONSchema({...descriptor.$defs[name], $defs: descriptor.$defs});
  const datasets = Object.entries(web.dataDownloadsRelativeToDescriptor).map(([name, path]) => {
    const base = path.endsWith('/') ? web.repository + '/tree/main/dist/buggy/' : web.rawBaseUrl;
    return {name, siteUrl: new URL(path, web.baseUrl).href, githubUrl: new URL(path, base).href};
  });

  return function createServer() {
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
  };
}
