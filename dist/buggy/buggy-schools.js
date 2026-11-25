// Each public listing was matched to the school-directory campus by school
// name, street address and ZIP. Campus links contain no search session or trip.
const verifiedOn = '2026-11-23';
const rows = [
  ["fl-private-13-2245", "ABF Academy Hialeah", "abf-academy-hialeah", "1851 PALM AVE", "33010"],
  ["fl-private-13-5197", "American Christian School And Art Center Hialeah", "american-christian-school-and-art-center-hialeah", "5888 W 20TH AVE", "33016"],
  ["fl-13-0510", "Archimedean Academy", "archimedean-academy", "12425 Sunset dr", "33183"],
  ["fl-13-3036", "Bridgeprep Academy Of Village Green Middle High School", "bridgeprep-academy-of-village-green-middle-high-school", "13300 SW 120th st", "33186"],
  ["fl-private-13-1284", "Christopher Columbus High School", "christopher-columbus-high-school-westchester", "3000 SW 87th ave", "33165"],
  ["fl-13-0841", "Coconut Grove Elementary School", "coconut-grove-elementary-school", "3351 MATILDA st", "33133"],
  ["fl-13-7071", "Coral Gables Senior High", "coral-gables-senior-high", "450 Bird rd", "33146"],
  ["fl-13-0070", "Coral Reef Montessori Academy Charter", "coral-reef-montessori-academy-charter", "10853 SW 216TH st", "33170"],
  ["fl-13-7101", "Coral Reef Senior High", "coral-reef-senior-high", "10101 SW 152nd st", "33157"],
  ["fl-13-7020", "Doral Academy Charter High", "doral-academy-charter-high", "11100 NW 27TH st", "33172"],
  ["fl-13-2351", "Eneida M. Hartner Elementary", "eneida-m-hartner-elementary", "401 NW 29th St", "33127"],
  ["fl-13-7781", "Felix Varela Senior High", "felix-varela-senior-high", "15255 SW 96th st", "33196"],
  ["fl-13-7051", "G. Holmes Braddock Senior High School", "g-holmes-braddock-senior-high-school", "3601 SW 147th ave", "33185"],
  ["fl-private-13-2934", "Gordon School at Center for Jewish Life", "gordon-school-at-center-for-jewish-life", "2625 SW 3rd Ave", "33129"],
  ["campus-gulliver-krutulis", "Gulliver Marian C. Krutulis PK-8 Campus", "gulliver-marian-c-krutulis-pk-8-campus", "12595 Red Rd", "33156"],
  ["fl-private-13-0640", "Gulliver Upper School Campus", "gulliver-upper-school-campus", "6575 N Kendall dr", "33156"],
  ["fl-13-5831", "Henry S. West Laboratory", "henry-s-west-laboratory", "5300 Carillo st", "33146"],
  ["fl-13-7191", "Hialeah Gardens Senior High", "hialeah-gardens-senior-high", "11700 HIALEAH GARDENS BLVD", "33018"],
  ["fl-13-1014", "HIVE Preparatory", "hive-preparatory", "5855 NW 171ST st", "33015"],
  ["fl-13-7121", "John A. Ferguson Senior High", "john-a-ferguson-senior-high", "15900 SW 56th st", "33185"],
  ["fl-private-13-0264", "McGlannan School", "mcglannan-school", "10770 SW 84th st", "33173"],
  ["fl-13-7201", "Miami Beach Senior High", "miami-beach-senior-high", "2231 Prairie ave", "33139"],
  ["fl-13-7361", "Miami Killian Senior High School", "miami-killian-senior-high-school", "10655 SW 97th ave", "33176"],
  ["fl-13-7391", "Miami Lakes Educational Center - High School", "miami-lakes-educational-center-high-school", "5780 NW 158th Street", "33014"],
  ["fl-13-7591", "North Miami Senior High School", "north-miami-senior-high-school", "13110 NE 8TH AVE", "33161"],
  ["fl-13-7371", "Robert Morgan Educational Center - High School", "robert-morgan-educational-center-high-school", "18180 SW 122ND ave", "33177"],
  ["fl-13-7862", "Secondary Student Success Center 803", "secondary-student-success-center-803-south-miami-heights", "18180 SW 122ND ave", "33177"],
  ["fl-13-2007", "Somerset Academy South Miami Elementary Charter School", "somerset-academy-south-miami-elementary-charter-school", "5876 68th st", "33143"],
  ["fl-private-13-2808", "St. Brendan High School", "st-brendan-high-school", "2950 SW 87th ave", "33165"],
  ["fl-13-7029", "Terra Environmental Research Institute", "terra-environmental-research-institute", "11005 SW 84th st", "33173"],
  ["fl-private-13-0246", "Vanguard School", "vanguard-school", "3939 Main Hwy", "33133"],
  ["fl-13-7601", "William H. Turner Technical Arts High School", "william-h-turner-technical-arts-high-school", "10151 NW 19th ave unit 7432", "33147"],
];
const directory = new Map(rows.map(([id, name, slug, street, zip]) => [
  id, Object.freeze({name, verifiedOn, street, zip, url: 'https://buggy.biz/schools/k12/' + slug}),
]));

export const verifiedBuggySchoolIds = new Set(directory.keys());

// Presence means Buggy publishes a page for the school. The operator checks
// ride availability for the family's address and dates on its own site.
export function lookupBuggySchool(id) {
  return directory.get(id) || null;
}
