import * as z from 'zod/v4';
import {checkCurrentListing} from './current-listing.mjs';
import {checkSchoolAssignment} from './school-assignment.mjs';

const textOrNull = z.string().nullable();
const linkOrNull = z.url().nullable();
const addressInput = z.string().trim().min(4).max(160).regex(/^\d[\dA-Za-z/-]* [^\p{C}]+$/u);
export const homeFactsInput = z.strictObject({
  homeId: z.string().trim().min(1).max(100).optional().describe('ID from search_homes. Supply this alone, or supply address and zip together.'),
  address: addressInput.optional().describe('Miami-Dade street number and street name. Include the unit when applicable.'),
  zip: z.string().regex(/^\d{5}$/).optional().describe('Five-digit ZIP for the supplied street address.')
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
    districtLocator: z.url(), notice: z.string(), bands: z.array(band)
  })
});

export async function checkHomeFacts(homes, args, {listingConfig = {}, fetchImpl = fetch, now = new Date()} = {}) {
  const {homeId, address, zip} = homeFactsInput.parse(args);
  if (homeId ? address !== undefined || zip !== undefined : !address || !zip) {
    throw new Error('Supply a homeId alone or a street address and ZIP together.');
  }
  const subject = homeId ? homes.find(row => row.id === homeId && !row.withheld) : {id: null, address, zip, state: 'FL'};
  if (!subject) throw new Error('Unknown home ID. Choose an ID from search_homes or supply the street address and ZIP.');
  const [listing, schoolAssignment] = await Promise.all([
    checkCurrentListing(subject, {...listingConfig, fetchImpl, now}),
    checkSchoolAssignment(subject, {fetchImpl, now})
  ]);
  return {home: {id: subject.id, address: subject.address, zip: subject.zip}, checkedAt: now.toISOString(), listing, schoolAssignment};
}
