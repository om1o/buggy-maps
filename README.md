# Buggy Maps

Plan a Miami-Dade school drive, compare campuses, calculate a departure time, and share schools in English or Spanish. When multiple homes match a search, use the arrow keys and Enter, or tap the intended address. Buggy confirms ride availability and fares on its own site.

## Run the map

**Portable bundle.** Extract the entire ZIP and double-click **Start Buggy Maps.cmd** on Windows. On other platforms run `python run.py`. The launcher requires Python 3.8 or newer, opens the map in a browser, and serves the app on this computer. Press Ctrl+C in the terminal to stop. The bundle includes the original map data and credits. The research-report link opens the published report.

**GitHub source.** This repository contains the caregiver interface, search and routing code, and verification scripts. Use an authorized checkout of the original Miami Home Archive Sites project for its release datasets, licensed images, operator configuration and linked archive. Run from the GitHub clone with Python and Git installed.

```sh
python run.py --source "/path/to/miami-home-archive"
```

The launcher reads commit `1e59168aee46ed867bc988107d922e534384dc50` (v14) from the supplied checkout into a temporary directory, then overlays the code in this repository. The original checkout can be on any branch containing the commit object. Its working files stay untouched.

## Verify

The bilingual regression suite uses Node.js 24 and the production ranker and planner handlers. It runs directly from a clean GitHub clone.

```sh
node scripts/verify-home-choice.mjs
```

For the complete checks, run `python run.py --check` in the extracted bundle, or `python run.py --source "/path/to/miami-home-archive" --check` in the GitHub clone. These commands also check discovery, property search, school-only sharing, trip history, arrival planning, booking links, the road graph and the school directory.

## Product checks

| Case | Expected result |
| --- | --- |
| Two matching homes | Enter shows the choices. A tap or an explicitly highlighted option selects the residence. |
| One matching home | A single Enter selects it, including when suggestions are still loading. |
| Edit during a pending search | A keypress on the earlier query cannot select or highlight a later result. |
| Coconut Grove sample | 1.6 miles and four minutes. For an 8:00 a.m. arrival and 12 minutes of parking, departure is 7:44 a.m. Miami time. |
| School-only share | A fresh recipient sees the selected campuses. The payload omits the residence and arrival plan. |

The app uses the original v14 data sources and public attribution notices. The optional provider, booking and imagery features use their existing external destinations. A local preview uses the original public school-link destinations for sharing. Pilot operations, recruitment and payments require an authorized operator.
