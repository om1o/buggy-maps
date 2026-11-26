import * as z from 'zod/v4';
import {checkCurrentListing} from './current-listing.mjs';
import {checkSchoolAssignment} from './school-assignment.mjs';

const textOrNull = z.string().nullable();
const linkOrNull = z.url().nullable();
const addressInput = z.string().trim().min(4).max(160).regex(/^\d[\dA-Za-z/-]* [^\p{C}]+$/u);
export const homeFactsInput = z.strictObject({
  homeId: z.string().trim().min(1).max(100).optional().describe('ID from search_homes. Supply this alone, or supply address and zip together.'),
  address: addressInput.optional().describe('Street address, including unit if applicable. You may include the ZIP at the end, e.g. 5550 SW 87th Ave, ZIP 33165.'),
  zip: z.string().regex(/^\d{5}$/).optional().describe('Five-digit ZIP unless already included after the address.')
});
const fact = value => z.object({
  verification: z.enum(['verified', 'unverified']), value: value.nullable(), reason: textOrNull,
  sourceUrl: linkOrNull, sourceUpdatedAt: textOrNull, checkedAt: textOrNull
});
const band = z.object({
  band: z.enum(['elementary', 'middle', 'high']), status: z.enum(['matched', 'unverified']), schoolYear: textOrNull,
  schoolId: textOrNull, schoolName: textOrNull, grades: textOrNull, sourceUrl: z.url(),
  metadataUrl: z.url(), evidenceUrl: linkOrNull, sourceDate: textOrNull, reason: textOrNull
});
export const homeFactsOutput = z.object({
  home: z.object({id: textOrNull, address: z.string(), zip: z.string()}), checkedAt: z.string(),
  listing: z.object({provider: z.string(), publicSearchUrl: z.url(), listingId: textOrNull, listingOffice: textOrNull,
    saleStatus: fact(z.string()), askingPriceUsd: fact(z.number().positive())}),
  schoolAssignment: z.object({
    homeId: textOrNull, address: z.string(), zip: z.string(), checkedAt: z.string(), addressStatus: z.enum(['verified', 'unverified']),
    status: z.enum(['matched', 'partial', 'unverified']), schoolYear: textOrNull, addressSourceUrl: z.url(),
    districtLocator: z.url(), bands: z.array(band), enrollmentStatus: z.literal('unverified'), notice: z.string()
  })
});

export async function checkHomeFacts(homes, args, {listingConfig = {}, fetchImpl = fetch, now = new Date()} = {}) {
  const input = homeFactsInput.parse(args);
  if (input.homeId && (input.address !== undefined || input.zip !== undefined)) {
    throw new Error('Supply one home reference at a time.');
  }
  // Some clients put a complete address in the ID slot. A numbered street and delimited ZIP
  // identify an address lookup unambiguously. Partial street strings never select a home.
  const combined = (input.address ?? input.homeId)?.match(/^(\d[\dA-Za-z/-]* [^\p{C}]+?)(?:\s*,\s*(?:ZIP\s+)?|\s+ZIP\s+)(\d{5})$/iu);
  const homeId = combined ? undefined : input.homeId;
  const address = combined ? combined[1].trim() : input.address;
  const zip = input.zip ?? combined?.[2];
  if (combined && input.zip && input.zip !== combined[2]) throw new Error('The two supplied ZIP codes disagree.');
  if (!homeId && (!address || !zip)) {
    throw new Error('Supply a homeId alone or a street address with its five-digit ZIP.');
  }
  const subject = homeId ? homes.find(row => row.id === homeId && !row.withheld) : {id: null, address, zip, state: 'FL'};
  if (!subject) throw new Error('Unknown home ID. Choose an ID from search_homes or supply the street address and ZIP.');
  const [listing, schoolAssignment] = await Promise.all([
    checkCurrentListing(subject, {...listingConfig, fetchImpl, now}),
    checkSchoolAssignment(subject, {fetchImpl, now})
  ]);
  return {home: {id: subject.id, address: subject.address, zip: subject.zip}, checkedAt: now.toISOString(), listing, schoolAssignment};
}
