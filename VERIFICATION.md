# Address selection verification

The Sites release used for this change was v14 at `1e59168aee46ed867bc988107d922e534384dc50`. The local Sites patch commit is `14f4a5e`. The GitHub import contains the caregiver source subset and has its own commit history.

In v14, the synthetic query `7101 NE Fixture Lane` returned units 2A and 2B. Pressing Enter in the route planner selected 2A. With the patch, Enter leaves both choices on screen. Tapping 2B or highlighting it with the arrow keys and pressing Enter selects 2B. Editing the query also cancels pending selection and highlight actions.

| Node verification | v14 | Updated |
| --- | ---: | ---: |
| Ambiguous addresses, 40 per language | 0/80 | 80/80 |
| Unambiguous addresses, 40 per language | 80/80 | 80/80 |
| Timing, Escape, building/unit, numeric prefixes, duplicate ZIPs and school controls | 4/14 | 14/14 |
| Total | 84/174 | 174/174 |

Run `node scripts/verify-home-choice.mjs` to reproduce the updated column. The suite uses synthetic records, the application's ranker and trip planner, and a minimal DOM harness. The product changes are in `dist/buggy/search.js`, `dist/buggy/trip-planner.js` and `dist/buggy/atlas.js`.

Independent Playwright walkthroughs used local Chromium 149.0.7827.55 and its touch emulation. English and Spanish passed at widths of 320, 390 and 430 CSS pixels. Both choices remained readable, explicit selection worked, and the home stayed out of the browser address bar. There was no horizontal overflow or uncaught page error in those runs. On the main search form, an exact building with a separate unit displayed both results. An exact, unique street address still opened directly.

In both languages, the public Coconut Grove example displayed 1.6 miles and four minutes. An 8:00 a.m. arrival and 12-minute parking buffer gave a 7:44 a.m. departure. A fresh browser context opened a school-only link with Coconut Grove Elementary and Ponce de Leon Middle. The link and recipient view omitted the home and arrival plan. These runs blocked external providers. Physical devices, native share sheets, caregiver studies, operator confirmations and bookings remain unverified.
