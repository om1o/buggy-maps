# Buggy Maps

Plan a Miami-Dade school drive, compare campuses, calculate a departure time, and share schools in English or Spanish. When multiple homes match a search, use the arrow keys and Enter, or tap the intended address. Buggy confirms ride availability and fares on its own site.

[Open the map](https://miami-homes-march-2026.aoraboracora.chatgpt.site/buggy/) · [Prepare a client brief](https://miami-homes-march-2026.aoraboracora.chatgpt.site/buggy/client-brief.html) · [Connect an AI agent](docs/AI-AGENTS.md#connect-an-mcp-client)

Connect an AI client to the live **Streamable HTTP** endpoint to list map datasets, find a campus, or create a school brief. Authentication is **None**. [Copy the URL and try the tools](https://miami-homes-march-2026.aoraboracora.chatgpt.site/buggy/agent-connect.html) · [Public MCP endpoint](https://wzykustudmsjbxugkrzu.supabase.co/functions/v1/buggy-maps-mcp)

## Get the data

Download school records, property rows, source snapshots, street geometry and the driving graph without signing in. The catalog provides paths for both the website and raw GitHub downloads. The full repository includes the map and its published data. Each source retains its own terms and credits. [Dataset catalog](https://raw.githubusercontent.com/om1o/buggy-maps/main/dist/buggy/agent-tools.json) · [School directory JSON](https://raw.githubusercontent.com/om1o/buggy-maps/main/dist/buggy/data/schools.json) · [Property coverage](dist/buggy/data/coverage.json) · [Download everything](https://github.com/om1o/buggy-maps/archive/refs/heads/main.zip)

## Run the map

Clone this repository or extract the entire portable ZIP. On Windows, double-click **Start Buggy Maps.cmd**. On other platforms run `python run.py`. The launcher requires Python 3.8 or newer and opens the map in a browser. Press Ctrl+C in the terminal to stop.

The `dist/` directory contains the published map, property records, school directory, local imagery, routing graph and linked research archive. File-level credits accompany the school and map assets. Publisher-hosted tours and optional external services keep their original links.

The source snapshot index lists the eight original data inputs and the county acquisition notes. Each entry gives its map-relative path, archive member when applicable, byte length and SHA-256. The supplemental download includes the five inputs unique to that archive. The county snapshot and manifest are in the full property download. The aerial verification record accompanies the county tiles. [Download the source index and supplemental files](dist/buggy/data/Buggy_Map_Source_Snapshots.zip)

## Prepare a client school brief

Choose **Real estate agents** on the map. Search for a campus by name, city or ZIP, then add up to three schools. Each printable brief includes public campus details and source links. Copy the school map link to share just those campuses. [Open the school brief](https://miami-homes-march-2026.aoraboracora.chatgpt.site/buggy/client-brief.html)

AI assistants can search the included directory and generate the same brief from confirmed school IDs. Run `node scripts/agent-schools.mjs search --query "Coconut Grove"` to see candidates and `node scripts/agent-schools.mjs brief --school fl-13-0841 --school fl-13-6741` to build a brief. [AI agent guide](docs/AI-AGENTS.md) · [Machine-readable tool and data links](dist/buggy/agent-tools.json)

## Verify

The bilingual regression suite uses Node.js 24 and the production ranker and planner handlers. It runs directly from a clean GitHub clone.

```sh
node scripts/verify-home-choice.mjs
```

For the complete checks, run `python run.py --check` from the clone or extracted bundle. The checks cover the agent commands, discovery, property search, sharing, trip history, arrival planning, booking links, the road graph and the school directory.

## Product checks

| Case | Expected result |
| --- | --- |
| Two matching homes | Enter shows the choices. A tap or an explicitly highlighted option selects the residence. |
| One matching home | A single Enter selects it, including when suggestions are still loading. |
| Edit during a pending search | A keypress on the earlier query cannot select or highlight a later result. |
| Coconut Grove sample | 1.6 miles and four minutes. For an 8:00 a.m. arrival and 12 minutes of parking, departure is 7:44 a.m. Miami time. |
| School-only share | A fresh recipient sees the selected campuses. The payload omits the residence and arrival plan. |

The app uses the original v14 data sources and public attribution notices. The optional provider, booking and imagery features use their existing external destinations. A local preview uses the original public school-link destinations for sharing. Pilot operations, recruitment and payments require an authorized operator.
