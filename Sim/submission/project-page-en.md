# Marswalk: Interplanetary Survival Guide, Martian Map

**Tagline:** A first-person walk across Jezero crater on real HiRISE terrain, with a route planner that shows its scores and limits.

**Team:** [TEAM NAME]
**Members:** [MEMBER NAMES]
**Challenge:** Interplanetary Survival Guide: Martian Map

**Links:**
- Demo video or slides: [VIDEO/SLIDES URL]
- Live demo: [LIVE DEMO URL]
- Code: [REPO URL]
- Sources and attribution: see `sources-en.md` in the repository

---

## Summary

Marswalk is a browser-based simulation of a short walk across Jezero crater on Mars. The user controls an astronaut in first person (WASD to walk, Space to hop) on terrain built from a NASA HiRISE digital terrain model. The app plans a route between two historical Perseverance waypoints, Sol 120 (WB1) and Sol 164 (Roubion), about 0.7 km apart. The route planner scores slope, roughness and data validity, and a minimap shows the route. The app also presents geology and rover-photo context.

This is a planning and exploration concept. It is not a mission tool and it does not certify any route as safe.

---

## How it addresses the challenge

- **Surface map:** The terrain is rendered in 3D (WebGL2) from a HiRISE DTM, with a 2D Canvas fallback. A minimap shows a local HiRISE view and a global Viking Mars context.
- **Planning:** The user can use the Sol 120 to Sol 164 preset or pick start and end points on the minimap. An A* planner finds a route, and three preferences (balanced, shortest, flattest) change the cost weights. The planner shows the scores it used.
- **Context:** The app shows USGS geologic unit boundaries and the distance to the nearest contact, with an uncertainty note. Perseverance archive photos from the two stops are included in a gallery.
- **Why this helps a survival guide:** It lets a viewer see how slope, roughness and gaps in the data change a walk across the same ground, using real mission datasets.

---

## NASA and USGS data used

Each item lists what the dataset is used for in the app. The full attribution and license status are in `sources-en.md`.

| Dataset | Used for | Status in the app |
|---|---|---|
| HiRISE DTM, PDS3 DTEEC_045994_1985_046060_1985_U01 (~1.01 m/px) | Displayed terrain, slope and route cost | Active (displayed) |
| USGS Mars 2020 TRN HiRISE DTM, 1 m window | Analysis window for slope, route checks and the ortho alignment test | Not displayed; vertical datum flagged `needs_review` |
| NASA JPL Mars Trek HiRISE ortho tiles (z17 0.318 m/px, z14 2.544 m/px) | Image overlay on the terrain (Hybrid / Ortho modes) | Overlay; alignment ±1.5 m, half-pixel alignment not proven |
| NASA Mars Trek MOLA regional elevation (~463 m/px) | Far horizon context only | Datum `needs_review`; not used for walkability |
| USGS Astrogeology Viking MDIM 2.1 color mosaic (232 m/px) | Global Mars context on the minimap | Processed color product; not terrain and not elevation |
| USGS SIM 3464 geologic map of Jezero (Sun and Stack, 2020; 1:75,000) | Geologic unit boundaries and distance to contact | Shown with an uncertainty note |
| NASA/JPL-Caltech Perseverance raw image archive (Sol 120 and Sol 164) | Photo gallery at the two stops | Raw JPEG previews, not calibrated |
| Mars 2020 MMGIS archive traverse and waypoints (M20_traverse, M20_waypoints) | Archived rover track layer and waypoint check | Archive data; not a human route and not live telemetry |
| Mars 2020 Initial Reports (PDS) | Waypoint coordinates for Sol 120 (WB1) and Sol 164 (Roubion) | Source of the two waypoints |
| NASA Planet Compare | Mars surface gravity, 3.71 m/s² (rounded reference) for the jump physics | Global reference; not a Jezero measurement |
| NASA NSSDC Mars Fact Sheet | Average and seasonal surface pressure (6.36 mbar; 4.0 to 8.7 mbar), cited in the documentation as context only; not displayed in the app | Average or seasonal values; not used to drag the astronaut |
| NASA NSSDC Sun Fact Sheet | Apparent solar diameter at 1 AU (1919 arcsec), scaled to Mars distance for the sky model | Only the disk size is taken from it |
| NASA GISS Mars24 sunlight algorithm | Sun direction and declination for a scenario (L_s 0°, 15:00 local true solar time) | Scenario parameters; not a live measurement |
| NASA Photojournal PIA19400 | Qualitative reference for the blue twilight effect in the sky model | No numbers are taken from it |

The PLACES dataset was **not** used. The rover track in the app is an archive layer, and the route between the two waypoints is a simplified straight-line connection planned with A*.

<!-- source: Sim/SOURCES.md (#1 to #14); Sim/DEMO_NOTES.md section 1; Sim/README.md "Özellikler" 1-15 and "Bilinen sınırlar" -->
<!-- source: Sim/public/js/config.js (marsGravityMps2 3.71, timeScale 8, walkSpeedMps 1.2) -->

---

## What is original (Creativity)

- **A first-person Mars walk in the browser.** It runs in WebGL2 with no install and no runtime dependencies. The 2D Canvas view covers the same planning when WebGL2 is not available.
- **A route planner that shows its weights.** The balanced, shortest and flattest preferences change visible cost weights. The displayed route and summary update when the preference changes, and a stale plan is not shown.
- **Terrain-sampled footprints and a route ribbon.** These are visual aids only. They do not claim any regolith mechanics.
- **A minimap that moves between scales.** It switches between a global Viking view and a local Jezero HiRISE view, and the route endpoints can be picked or dragged.
- **Labels for data status.** The documentation labels every number as MEASURED, COMPUTED, SCENARIO or PRESENTATION (see the Validity section).

The A* search, the Horn slope filter and the hillshade are standard techniques. The contribution is combining them with real Mars datasets in one transparent, browser-based walk.

---

## Why it matters and who benefits (Impact)

Marswalk is a concept for pre-EVA exploration planning and public understanding. It is not an operational tool.

- **Students and educators** can see how terrain, data gaps and route choices change a walk on the same ground.
- **Mission-concept designers** can use it as a sandbox to test how planning preferences change a route. Any real planning would need validated tools and data.
- **The public** can explore Jezero and the Sol 120 to Sol 164 traverse context.

Limits on impact: there is no live telemetry, no operational use, and no validation for astronaut or rover decisions.

---

## Validity

**Labels for numbers.** Every number in the app and the documentation is labeled:
- **MEASURED:** read directly from a data file (for example, the DTM cell count and the valid-cell count of the displayed window).
- **COMPUTED:** derived from measured data or from stated inputs (for example, the jump apex of about 0.78 m, from v0 = 2.4 m/s and g = 3.71 m/s²).
- **SCENARIO:** a chosen game or planning parameter (walk speed 1.2 m/s, time acceleration 8x, corridor half-width 10 m, slope threshold 20 degrees).
- **PRESENTATION:** a visual choice only (sky, shadows, footprints, route ribbon, camera sway, 2x and 3x exaggeration).

<!-- source: Sim/DEMO_NOTES.md section 1 (labels and table); Sim/public/js/config.js lines 5-15 -->

**Fail-closed data handling.**
- No-data is never set to zero and never treated as walkable.
- A slope is not computed if any cell in its 3x3 window is invalid.
- Route cost and the route-endpoint picker reject no-data and edge cells. This is covered by unit tests; a browser test of the rejection is not done yet.

<!-- source: Sim/README.md "Özellikler" 5; Sim/DEMO_NOTES.md section 1 (no-data rules) -->

**Caveats we state plainly:**
- **The displayed terrain is a legacy fallback.** The app shows the PDS3 HiRISE DTEEC DTM window. The newer USGS Mars 2020 TRN 1 m window is flagged `needs_review` because its vertical datum is not proven, so it is used only in the analysis documents. Which terrain should be shown is an open product decision.
- **Vertical datum is not proven.** No absolute elevation is claimed. The two data files disagree about whether the datum is verified, and the team has not yet resolved this.
- **Orthoimage alignment is not proven for the displayed terrain.** The ±1.5 m offset was measured only on the USGS analysis window. We then ran the same method on the displayed (legacy) terrain and it did **not** find a reliable registration (correlation peak r = 0.021; decision: "not proven"), so no alignment claim is made for the orthoimage overlay on the displayed terrain. Half-pixel alignment is not proven in either case.
- **Known registration issue on the displayed terrain.** The route-planning cost map and the elevation sampler use two slightly different coordinate bridges for the legacy DTM. For the same local position they pick cells that differ by about 19 m at the start waypoint, about 23 m at the destination and up to about 41 m at the east edge of the window. Route lengths and slopes stay plausible, but the planned route is not guaranteed to follow the terrain exactly as walked in 3D. This is logged as a known issue. The JPEG 2000 ortho file is not decoded, so the "ortho" view is a hillshade derived from the DTM.
- **Route results differ between the two DTMs.** For the same endpoints, the shortest route has a maximum slope of 14.1 degrees on the displayed DTM and 10.64 degrees on the analysis window.
- **The "flattest" preference does not always lower the maximum slope.** On the displayed DTM it gave 10.1 degrees against 9.8 degrees for the balanced route. The name describes an intent, not a measured result.
- **The route time estimate uses 0.8 m/s, while the simulation walks at 1.2 m/s (x8 time).** This inconsistency is known and listed in the documentation.
- **The 20-degree walkability threshold is a scenario parameter.** It is not taken from a source. The walkability score is a planning indicator, not a safety score.
- **Gravity is a rounded global reference.** NASA Planet Compare gives 3.71 m/s² and the NSSDC fact sheet gives 3.73 m/s². Neither is a Jezero measurement.
- **Atmosphere does not affect movement.** Pressure and density are average or seasonal reference values. No atmospheric drag is applied, because no suit or body parameters are sourced.
- **Visual effects are presentation, not data.** Sky, shadows, footprints, the route ribbon and the astronaut's appearance are not measured quantities.

<!-- source: Sim/DEMO_NOTES.md sections 3 and 4; Sim/stage-final-acceptance.md (B and R1 rows); Sim/stage-merge-review.md; Sim/public/js/config.js line 56; Sim/data/dtm_subset.json (verticalDatumVerified false) -->
<!-- source: Sim/stage39-ortho-diagnosis.md (+/-1.5 m, r ~0.40, USGS window); Sim/stage23-route-validation.md; Sim/DEMO_NOTES.md section 4 (0.8 m/s vs 1.2 m/s) -->

---

## Relevance

Marswalk uses NASA and USGS Mars data in its core functions, not as decoration. The HiRISE terrain drives the 3D surface, the slope and the route cost. The MOLA, Viking and geologic map layers give regional, color and geologic context. The Perseverance archive and the fact-sheet values appear in the stop photos and the sky and gravity parameters.

The challenge asks for tools that help people understand and plan surface activity on Mars using mission data. Marswalk does this for one site, the Sol 120 to Sol 164 traverse at Jezero, and it says clearly where the data is not yet validated.

---

## Technology and how it was built

- **Stack:** Vanilla JavaScript ES modules, WebGL2 rendering, a Canvas 2D fallback, and a Web Worker for the A* planner. There are no runtime dependencies.
- **Server:** A small Node.js static server (`server.mjs`) on 127.0.0.1. It needs Node.js 20 or newer.
- **Tests:** 612 unit tests run with `node --test test/`, all passing (exit code 0, last run on 15 November 2026). The data preflight script reported READY in the last recorded run.
- **Browser checks:** 38 of 38 browser smoke checks passed on the last recorded run (merge review of the team's repository). These were not re-run for this submission.
- **AI-assisted development:** AI coding assistants were used during development. The commit history names OpenAI Codex, Anthropic Claude and Antigravity. The team reviewed the changes. [TEAM TO CONFIRM this wording]

<!-- source: Sim/package.json (no dependencies, engines node >=20); Sim/server.mjs line 2 and 11; test run on 15 Nov 2026 (612/612, exit 0); Sim/stage-merge-review.md section 7 (38/38) -->
<!-- source: git log author fields in the repository (AI assistant names) -->

---

## How to run

**Requirements:** Node.js 20 or newer. There is nothing to install with npm.

1. Start the server: `npm start`, then open `http://127.0.0.1:8080/`. The `PORT` environment variable changes the port.
2. Guided demo (recommended): `http://127.0.0.1:8080/?demo=1`. This opens presentation mode and prepares the Sol 120 to Sol 164 route.
3. First-person view: `http://127.0.0.1:8080/?view=3d`. If the DTM or WebGL2 is missing, the app stays in 2D.

Optional parameters: `?scale=1|2|3` (vertical scale; 2 and 3 are labeled exaggerations), `?shadows=off|low|high`, `?horizon=off`.

Controls: WASD or arrow keys to walk, Space to hop (3D), P to pause, R to restart, click the scene to look around, Esc to release the mouse.

Live demo: [LIVE DEMO URL]

<!-- source: Sim/README.md "Çalıştırma" and "URL parametreleri"; Sim/public/js/main.js lines 36-42 and 1923; Sim/public/js/input/input.js lines 5-8, 45-53; Sim/server.mjs line 11 -->

---

## Limitations (summary)

- Not a safe-route, navigation or decision-support tool. No walkability score is a safety certificate.
- No live NASA telemetry. The simulation clock is a scenario clock, not real time on Mars.
- No real human route and no PLACES traverse. The route is a simplified A* connection between two historical waypoints.
- The displayed terrain is a legacy DTM fallback. The vertical datum is not proven, and the ortho alignment is not proven for the displayed terrain.
- Walking speed, jump height, slope thresholds and route preferences are scenario parameters, not measured astronaut or rover values.
- No atmospheric drag, suit model or body model.
- Licenses: 13 of the 14 sources state no license. Only the USGS 1 m DTM window states CC0 1.0. Licenses must be confirmed before any reuse outside the submission.
- Frame rate depends on the hardware. We have not published a single benchmark value yet.

---

## References

See `sources-en.md` for the full list with URLs and license status.
