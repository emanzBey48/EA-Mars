# Marswalk: slide deck (7 slides, English)

Use this if the team submits slides instead of a video. The official limit is up to 7 slides, and the title and intro slides count (verify on the official submission guide, see `submission-checklist-en.md`). This deck has exactly 7 slides.

Screenshot files live in `Sim/acceptance-evidence/k1-2/`. Their names are real; open each one before using it, because the names were assigned during acceptance and a few are known to be imperfect (see `Sim/stage-merge-review.md`).

---

## Slide 1: Title

**Headline:** Marswalk: Interplanetary Survival Guide, Martian Map

- Team: [TEAM NAME]
- Members: [MEMBER NAMES]
- Challenge: Interplanetary Survival Guide: Martian Map
- A first-person walk across Jezero crater on real HiRISE terrain

**Speaker notes:** Introduce the team and the challenge. Say at the start that this is a planning and exploration concept, not a mission tool.

**Suggested visual:** `Sim/acceptance-evidence/k1-2/01-demo-3d.png` (first-person 3D view)

---

## Slide 2: The problem and what we built

**Headline:** Walking on Mars depends on the ground under your feet

- Slope, roughness and gaps in the data change how a walk feels and how a route is chosen
- Marswalk shows this on one real site: the Sol 120 (WB1) to Sol 164 (Roubion) traverse, about 0.7 km
- Built for students, educators and mission-concept exploration
- Not an operational, navigation or safety tool

**Speaker notes:** Explain that the app connects real NASA terrain data to a walk the viewer can control. Stress that it helps people understand planning trade-offs and does not decide anything for a real mission.

**Suggested visual:** `Sim/acceptance-evidence/k1-2/04-global-viking.png` (global Mars context, shown as color context only)

---

## Slide 3: NASA and USGS data and what each one is used for

**Headline:** Real datasets, each with a stated role

- **HiRISE DTM** (~1.01 m/px): the displayed terrain and slope (legacy window)
- **USGS Mars 2020 TRN 1 m DTM:** analysis window for slope and route checks; not displayed
- **HiRISE ortho tiles:** image overlay; alignment ±1.5 m, half-pixel not proven
- **MOLA, Viking, USGS SIM 3464:** far horizon, color context and geologic units
- **Perseverance archive and M20 traverse:** stop photos and an archived track layer; not a human route

**Speaker notes:** Name each dataset and its role. Say that the PLACES dataset was not used, and that the rover track is an archive layer, not a live feed.

**Suggested visual:** `Sim/acceptance-evidence/k1-2/03-geology.png` (geology layer). Alternative: `Sim/acceptance-evidence/k1-2/02-gallery.png` (Perseverance photos)

---

## Slide 4: Route planning with visible scores

**Headline:** A* route with three preferences, and its limits shown

- The planner uses slope, roughness and data validity as cost terms
- Preferences: balanced, shortest, flattest; each changes the cost weights
- No-data cells are never walkable (unit-tested)
- Displayed-DTM example (computed): shortest route maximum slope 14.1°; balanced 9.8°
- Known gap: "flattest" did not give the lowest maximum slope in this run (10.1°); the label describes intent

**Speaker notes:** Show that the route and summary update when the preference changes. Be direct that the flattest preference does not always lower the peak slope, and that the 20-degree threshold is a scenario choice, not a sourced limit.

**Suggested visual:** `Sim/acceptance-evidence/k1-2/08-route-replanning.png` (route replanning). Alternative: `Sim/acceptance-evidence/k1-2/09-route-flattest.png`

---

## Slide 5: First-person walk and what is original

**Headline:** A browser walk on real terrain, with no install

- Runs in WebGL2 with no dependencies; a 2D Canvas view works when WebGL2 is missing
- Route ribbon and footprints are visual aids sampled from the terrain
- Hop physics use Mars gravity 3.71 m/s² (NASA rounded reference): about 1.3 s airtime, about 0.78 m apex (computed from a 2.4 m/s scenario input)
- Minimap switches between global Viking context and a local Jezero view

**Speaker notes:** Say what is new here: the first-person walk on a HiRISE-derived terrain, the visible route weights, and the minimap. Say that the A* search and slope filter are standard methods.

**Suggested visual:** `Sim/acceptance-evidence/k1-2/05-minimap-zoom.png` (minimap, local view)

---

## Slide 6: Measured, computed or scenario?

**Headline:** Every number has a label

| Label | Meaning | Examples |
|---|---|---|
| **MEASURED** | Read from a data file | DTM size and valid cell count (displayed window); NASA gravity reference 3.71 m/s² (global, rounded) |
| **COMPUTED** | Derived from measured data or stated inputs | Jump apex ~0.78 m; airtime ~1.3 s; straight-line route ~0.69 km |
| **SCENARIO** | Chosen game or planning parameter | Walk speed 1.2 m/s at 8x time (9.6 m/s on the wall clock); corridor ±10 m; 20° threshold |
| **PRESENTATION** | Visual choice only | Sky, shadows, footprints, route ribbon, camera sway, 2x and 3x exaggeration |

**Speaker notes:** Read the four labels aloud. Say that the Sol 120 to Sol 164 time estimate in the app uses a different walk speed (0.8 m/s) from the simulation (1.2 m/s); this is a known inconsistency that is documented.

**Suggested visual:** None. Use the table above.

---

## Slide 7: Honest limits and how to try it

**Headline:** What Marswalk does not do

- Not a safe-route or decision tool; no safety certificate
- No live NASA telemetry; no real rover or human route
- The displayed terrain is a legacy DTM fallback; the newer USGS window is flagged needs_review
- Vertical datum not proven; no absolute elevation claimed; ortho alignment not proven for the displayed terrain
- No atmospheric drag; 13 of 14 sources state no license, so licenses are confirmed before reuse
- Try it: [LIVE DEMO URL] · Code: [REPO URL] · Sources: sources-en.md

**Speaker notes:** End on the limits. Say that the team chose to show these limits in the app and in the documentation, and that a judge can check each number against the labelled sources.

**Suggested visual:** `Sim/acceptance-evidence/k1-2/07-2d-fallback.png` (2D view, shown as the fallback). Add the link as a QR code if the venue allows.
