import {McpServer} from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
import {validateDataset} from '../../dist/buggy/data-loader.js';
import {buildSchoolBrief, searchBriefSchools} from '../../dist/buggy/school-brief.js';
import {createSchoolDirectory} from '../../dist/buggy/school-mode.js';
import propertySnapshot from './property-snapshot.json' with {type: 'json'};
import {searchHomes, compareNearbySchools} from './property-tools.mjs';
import {checkHomeFacts, homeFactsInput, homeFactsOutput} from './home-facts.mjs';

const language = z.enum(['en', 'es']).default('en');
const readOnly = {readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false};
const response = value => ({structuredContent: value, content: [{type: 'text', text: JSON.stringify(value)}]});
const home = z.object({
  id: z.string(), address: z.string(), city: z.string(), state: z.string(), zip: z.string(),
  askingPriceUsd: z.number().positive(), priceLabel: z.string(), observedOn: z.string(), sourceUrl: z.url(),
  currentAvailability: z.literal('unverified'),
  beds: z.number().nullable(), baths: z.number().nullable(), sqft: z.number().nullable()
});
const nearbySchool = z.object({
  id: z.string(), name: z.string(), grades: z.string(), type: z.string(),
  sourceUrl: z.string(), distanceMiles: z.number().nonnegative()
});

export function schoolServerFactory(descriptor, loadSnapshot, listingConfig = {}) {
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
    server.registerTool('search_homes', {
      description: 'Find homes by five-digit ZIP and/or inclusive archived asking-price bounds in USD, ordered by price then ID. Pass a returned ID to check_home_facts for current listing facts and attendance zones or compare_nearby_schools for distances.',
      inputSchema: z.strictObject({
        zip: z.string().regex(/^\d{5}$/).optional(),
        minPrice: z.number().nonnegative().optional(), maxPrice: z.number().nonnegative().optional(),
        limit: z.number().int().min(1).max(20).default(6), offset: z.number().int().nonnegative().default(0)
      }),
      outputSchema: z.object({priceBasis: z.literal('archived_asking_usd'), availabilityNote: z.string(),
        totalMatches: z.number().int().nonnegative(), offset: z.number().int().nonnegative(), homes: z.array(home)}),
      annotations: readOnly
    }, args => response(searchHomes(propertySnapshot.homes, args)));
    server.registerTool('compare_nearby_schools', {
      description: 'Compare the closest mapped campuses for one to three homes returned by search_homes. Returns grades, school type, source and straight-line miles in the requested order. Use check_home_facts for attendance zones.',
      inputSchema: z.strictObject({homeIds: z.array(z.string().min(1).max(100)).min(1).max(3),
        limit: z.number().int().min(1).max(5).default(3)}),
      outputSchema: z.object({distanceBasis: z.literal('straight_line_miles'), attendanceAssignment: z.literal('unverified'), attendanceNote: z.string(),
        districtLocator: z.url(), comparisons: z.array(z.object({home, locationStatus: z.enum(['mapped', 'unavailable']),
          schools: z.array(nearbySchool)}))}),
      annotations: readOnly
    }, async args => {
      await directory.load();
      return response(compareNearbySchools(propertySnapshot.homes, directory.all, args));
    });
    server.registerTool('check_home_facts', {
      description: 'Check whether a Miami-Dade home is listed for sale, its current asking price in USD, and its zoned public schools by grade band. Supply a homeId OR a street address including unit and a five-digit ZIP. Report each field with its source and date, or say unverified. County attendance zones describe geographic assignment. Confirm enrollment with the district.',
      inputSchema: homeFactsInput, outputSchema: homeFactsOutput, annotations: {...readOnly, openWorldHint: true}
    }, async args => response(await checkHomeFacts(propertySnapshot.homes, args, {listingConfig})));
    return server;
  };
}
