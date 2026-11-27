# Address selection verification

## Miami MLS connection check, November 26, 2026

The live MCP (Edge Function version 7) returned `provider_not_configured` for **3039 Orange St, Unit B, Coconut Grove, FL 33133**. Compass identifies the property as Miami MLS **A12113130**. No MLS record, asking price or source modification date reached the MCP. The strict positive acceptance check failed as intended. [Listing brokerage's page](https://www.compass.com/homedetails/3039-Orange-St-Unit-B-Coconut-Grove-FL-33133/1CNGZW_pid/) · [Signed-out AI transcript and raw listing fields](docs/qa/miami-mls-feed-2026-11-26.json)

A local Qwen3-0.6B client initially constructed an unknown home ID. Given the explicit street and ZIP fields, it called the published tool with the correct address and reported both fields unverified. Its answer opened with “The verified MLS record” and later acknowledged that no complete MLS record was obtained. The structured response establishes that no provider check occurred. Seven simulated adapter tests passed, including a positive quote with a source and update date and a check that a combined-feed token cannot fall back to private records. [Feed activation and positive verification](docs/AI-AGENTS.md#connect-and-verify-the-licensed-miami-feed)

## Current home facts, November 26, 2026

The published `check_home_facts` tool passed **18 anonymous production checks** on the November 26 deployment. Eleven requests covered a returned home ID, street addresses, embedded ZIPs, an exact apartment, missing or nonexistent units, a wrong ZIP and two complete addresses placed in the ID field by an AI client. Seven incomplete or conflicting requests were rejected. The official MCP SDK separately discovered and called all six public tools. [Public endpoint](https://wzykustudmsjbxugkrzu.supabase.co/functions/v1/buggy-maps-mcp)

For **5550 SW 87th Ave, 33165**, the county's September 21, 2026 attendance layers returned Blue Lakes K-8 Center (elementary band), Glades Middle and Southwest Miami Senior High for the 2026–27 school year. A separate county GIS service returned the same school IDs. A matched zone still returned `enrollmentStatus: "unverified"`. [Elementary record](https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/ElementaryAttendanceBoundary_gdb/FeatureServer/0/71) · [Middle record](https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/MiddleAttendanceBoundary_gdb/FeatureServer/0/20) · [High record](https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/HighAttendanceBoundary_gdb/FeatureServer/0/20)

At **1800 SW 3rd St, 33135**, apartment B matched Shenandoah Elementary, Shenandoah Middle and Miami Senior High. Omitting the unit or entering a nonexistent unit returned three unverified bands. Each production test returned a null current asking price and sale status with reason `provider_not_configured`. No licensed live MLS feed was connected. Positive listing tests used simulated Bridge responses covering an exact relisting, display permission, price, record update time and request time.

A signed-out local Qwen3-0.6B client received all six tool descriptions from production and chose `check_home_facts` on its first call for all three prompts. It needed no model-provider account, map account, GitHub account or checkout of the server. The home-ID answer correctly identified the three schools, the September 21 edition date, school year and unverified enrollment, sale status and price. The street-address answer named the same schools but called the November 26 request date the source date. The ambiguous-building answer supplied no price or schools but added unsupported remarks about the seller and district. Cite the evidence link and `sourceDate` on each matched band, and use the listing field's own update date when available. [Signed-out test results](docs/qa/current-home-facts-2026-11-26.json)

On the published connection page, fresh Chromium sessions exercised the English card at 390 pixels and the Spanish card at 1200 pixels. Each showed two unverified listing fields, three dated county school records and the official enrollment locator with no browser errors. Local browser fixtures also exercised keyboard interaction, retries and layouts at 320 and 430 pixels. The production JavaScript, tool catalog and discovery text matched the public GitHub files byte for byte. [Live connection page](https://miami-homes-march-2026.aoraboracora.chatgpt.site/buggy/agent-connect)

Reproduce the signed-out protocol and 2026–27 address checks from a checkout with Node.js 24.

```sh
npm ci --prefix integrations/mcp
node integrations/mcp/verify-http.mjs https://wzykustudmsjbxugkrzu.supabase.co/functions/v1/buggy-maps-mcp --zones-2026
```

## Home and nearby-school MCP acceptance, November 26, 2026

The public endpoint passed anonymous tests for exact ZIP matching, inclusive price bounds, pagination, unknown and duplicate IDs, and comparison of two homes in the requested order. The asking-price snapshot contains 1,661 homes in 39 ZIP codes. A full local pass paginated every home exactly once and compared its five closest physical campuses against the published directory. Three campuses had no published grade range and retained their empty source value.

| Live AI client | What the model did | Observed result |
| --- | --- | --- |
| Qwen3-0.6B, local CPU, no provider or map sign-in | Searched ZIP 33135 at exactly $349,000, then passed the returned ID to `compare_nearby_schools` | Kids Small World Learning Center LLC at 0.25 straight-line miles and Waymaker Academy at 0.40 miles. The model conveyed uncertainty about availability. It omitted the school-assignment caveat in its summary. |
| Codex, no map credentials | Tested $348,999 in ZIP 33135, searched two ZIPs at $349,000, then compared both returned IDs | Zero matches below the boundary, one in each ZIP at the boundary, four independently checked distances. The model reported both availability and assignment as unverified. |

The local model used an ungated Q5_K_M quantization of Qwen3-0.6B with llama.cpp. Its inference ran on loopback. The service returns `currentAvailability: "unverified"` for each home and `attendanceAssignment: "unverified"` for each comparison. The live SDK test also exercises the three original tools. [Run the HTTP check](docs/AI-AGENTS.md#connect-an-mcp-client) · [Qwen model card](https://huggingface.co/Qwen/Qwen3-0.6B) · [Quantized model revision](https://huggingface.co/unsloth/Qwen3-0.6B-GGUF/tree/50968a4468ef4233ed78cd7c3de230dd1d61a56b)

## Public MCP acceptance, November 26, 2026

Codex CLI 0.160.0 ran in an empty directory with the public Streamable HTTP URL as its only MCP server. Its existing ChatGPT session supplied the model. The map endpoint received no API key or account credentials. The client event stream recorded three completed MCP calls with zero tool errors.

| Tool | Input | Observed result |
| --- | --- | --- |
| `list_map_datasets` | `{}` | 16 datasets and source links |
| `search_schools` | `primaria Coconut Grove`, Spanish, limit 2 | Coconut Grove Elementary School |
| `build_school_brief` | `fl-13-0841`, then `fl-13-6741`, Spanish | A link containing only school mode, the two campus IDs in order, and the language |

The official SDK client independently checked tool discovery, outputs, invalid campus rejection and English and Spanish share links. [Run the HTTP check](docs/AI-AGENTS.md#connect-an-mcp-client) · [Open the brief returned by the AI client](https://miami-homes-march-2026.aoraboracora.chatgpt.site/buggy/?mode=schools&campuses=fl-13-0841%2Cfl-13-6741&lang=es)

## Client school briefs and agent commands

English and Spanish Playwright runs covered 320, 390, 430 and 1280 CSS pixels in Chromium 149. All eight walks passed. Each searched for a school, selected and removed campuses, shared the results and opened the school-only link in a fresh recipient context. Two additional retry cases recovered from a directory failure. The Coconut Grove example also worked at 320 pixels with 200% text. Both languages produced a one-page Chromium PDF for the two-school example with a directory date, campus sources and the full district locator URL.

The Node agent checks passed 31 CLI invocations, including both real-directory examples. Selectors resolve explicit IDs against the included snapshot. Search and brief output expose school facts; the share link contains the chosen campus IDs and optional language.

Run `python run.py --check` for the eleven repository verification scripts. Real-guardian studies, physical devices and printers remain outside these results.

## Address selection in the original v14 release

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
