# Marswalk: quick start for judges

**Marswalk** is a browser-based simulation of a short walk across Jezero crater on Mars, built for the NASA Space Apps 2026 challenge *Interplanetary Survival Guide: Martian Map*.

You control an astronaut in first person on terrain built from a NASA HiRISE digital terrain model. The app plans a route between two historical Perseverance waypoints (Sol 120 / WB1 and Sol 164 / Roubion, about 0.7 km apart), and it shows the route scores and their limits.

**What it is not:** It is not a mission tool, a navigation system or a safety certificate. It has no live NASA telemetry, and the route is not a real rover or human track.

Full project text: `project-page-en.md`. Sources: `sources-en.md`.

---

## Requirements

- Node.js 20 or newer. There is nothing to install with npm (no runtime dependencies).
- A modern browser. WebGL2 is needed for the 3D view. Without it the app stays in 2D.
- Data files: the terrain files are stored with Git LFS. If a `.f32` file is only a 132-byte pointer, run `git lfs pull`.

## Three ways to open it

1. **Standard start.** Run `npm start` and open `http://127.0.0.1:8080/`. The route setup window opens.
2. **Guided demo (recommended).** Open `http://127.0.0.1:8080/?demo=1`. This opens presentation mode and prepares the Sol 120 to Sol 164 route. Then click **Örnek Görevi Başlat (Sol 120 → Sol 164)** (Start sample mission, Sol 120 to Sol 164) to start the 3D walk.
3. **Direct 3D view.** Open `http://127.0.0.1:8080/?view=3d`. If the terrain or WebGL2 is missing, the app stays in 2D.

The server uses `127.0.0.1` on port 8080 by default. Set the `PORT` environment variable to change the port.

### Other URL parameters

| Parameter | Values | Effect |
|---|---|---|
| `scale` | `1` (default), `2`, `3` | Vertical scale. 1 is the real terrain height; 2 and 3 are labeled visual exaggerations |
| `shadows` | `off`, `low`, `high` (default) | Sun shadow map resolution: 0, 1024 px, 2048 px |
| `horizon` | `off` | Hides the regional MOLA horizon. Other values keep it on |
| `debug` | `1` | Enables the `window.marswalk` test hook (development only) |

## Controls

| Action | 2D view | 3D view |
|---|---|---|
| Move | WASD or arrow keys | WASD or arrow keys, relative to the camera direction |
| Hop | — | **Space** makes a small scenario hop |
| Pause or resume | **P** or **Space** | **P** (Space is a hop in 3D) |
| Look around | — | Click the scene, then move the mouse. **Esc** releases the mouse (browser behavior) |
| Restart | **R** | **R** |
| Zoom | **+** / **-** or mouse wheel | **+** / **-** or mouse wheel |

On screen, the buttons are labeled in Turkish. The main ones are:
- **Sunum Modu** (presentation mode, header)
- **Örnek Görevi Başlat (Sol 120 → Sol 164)** (start the sample mission)
- **2D / 3D Görünüm** (switch view)
- **Başa Dön** (restart)
- **Mars globali göster** (show global Mars) and **Kapsama sığdır** (fit to coverage), on the minimap
- **Rota tercihi** (route preference): Dengeli EVA Yürünebilirlik (balanced), En Kısa Mesafe (shortest), En Düz / Düşük Eğim (flattest)

## What to look for

- The turquoise route ribbon and footprints in the 3D walk
- The minimap: a local Jezero view and a global Viking Mars view
- The route summary and the preference change (balanced, shortest, flattest)
- The labels on the 3D scale and the horizon, which state their limits
- The 2D fallback, which runs without WebGL2

## Honest limits

- **The displayed terrain is a legacy HiRISE DTM fallback.** The newer USGS 1 m window is flagged `needs_review` (vertical datum not verified), so it is used for the analysis documents, not the display.
- **Vertical datum is not proven.** No absolute elevation is claimed.
- **Orthoimage alignment is not proven** for the displayed terrain. The JPEG 2000 ortho file is not decoded, and the "ortho" view is a hillshade derived from the DTM.
- **Walkability scores are planning aids,** not safety scores. The 20-degree threshold is a scenario parameter, not a sourced limit.
- **Walking speed is a scenario value.** The simulation uses 1.2 m/s at 8x time. The route time estimate in the route panel uses 0.8 m/s. This inconsistency is known.
- **No atmospheric drag** and no suit or body model. Atmosphere values are NASA average or seasonal reference values.
- **No live telemetry, no PLACES traverse,** and no real rover or human route.
- **Licenses:** 13 of the 14 sources state no license. See `sources-en.md`.

Full list of numbers and their labels (MEASURED, COMPUTED, SCENARIO, PRESENTATION): `Sim/DEMO_NOTES.md`. Note that this file is in Turkish.

## Tests and acceptance reports

- **Unit tests:** `node --test test/` (run from the `Sim` folder). Result on 15 November 2026: 601 of 601 passing, exit code 0. `npm test` runs the unit tests in `test/` through a file pattern; it was not run separately for this pack.
- **Data check:** `node scripts/preflight.mjs` checks the data and source files. Last recorded result: READY.
- **Browser smoke test (optional):** `npm run smoke` needs Node.js 22 or newer and a local Edge or Chrome. Last recorded result: 38 of 38 on the team's merge review. It overwrites the PNG files in `Sim/test-output/`.
- **Acceptance evidence:** `Sim/stage-final-acceptance.md` (PASS, FAIL and NOT-TESTED items with reasons) and `Sim/acceptance-evidence/k1-2/` (screenshots).
- **Merge review:** `Sim/stage-merge-review.md`.
- **Known issues list:** `Sim/stage-final-acceptance.md`, section (c).
