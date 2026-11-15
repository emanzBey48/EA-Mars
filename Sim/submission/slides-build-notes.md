# Slide deck build notes

Output: `Sim/submission/marswalk-slides.pptx` (7 slides, 16:9, English, speaker notes on every slide).

## How it was generated

- Built with `python-pptx` 1.0.2 in a local virtual environment outside the repo. The pptxgenjs path from the skill was not available (not installed globally).
- Text, bullets, speaker notes and the slide 6 table were parsed from `slides-en.md` at build time, so the deck follows the source slide by slide. The layout is fixed in the build script.
- Structure check: `validate.py` (pptx skill) reports "All validations PASSED"; the file reopens with 7 slides.
- Visual check: rendered all 7 slides with PowerPoint (COM export). No LibreOffice on this machine.

## Design

- Background: solid deep charcoal (`1C1816`). Text: off-white (`F4EDE6`). Accent: rust-orange (`E87A4A` for bullets and labels). Secondary text: `C4BAB0`.
- Font: Calibri throughout (titles bold 34 pt, title slide 40 pt, body 18 pt, captions 16 pt, footer 14 pt).
- Each content slide: small "NN / 07" counter, headline, 4 to 5 bullets on the left, screenshot on the right with a one-line caption.

## Images used (all from the repo, copied and not edited)

| Slide | File in `img/` | Source screenshot | Note |
|---|---|---|---|
| 1 Title | `s1-title-firstperson-route.png` | `scratchpad/visual/dust-route-fp-a.png` | Downscaled to 1000 px wide (614 KB). Chosen per the brief (first-person view with route ribbon), not `01-demo-3d.png` as in the source. |
| 2 Problem | `s2-global-viking.png` | `Sim/acceptance-evidence/k1-2/04-global-viking.png` | As in source. |
| 3 Data | `s3-geology-layers.png` | `Sim/acceptance-evidence/k1-2/03-geology.png` | As in source. Interface is in Turkish (caption says so). |
| 4 Routes | `s4-route-flattest.png` | `Sim/acceptance-evidence/k1-2/09-route-flattest.png` | Changed from `08-route-replanning.png`, which shows "Rota hesaplanıyor" (route still computing). |
| 5 Walk | `s5-minimap-local.png` | `Sim/acceptance-evidence/k1-2/05-minimap-zoom.png` | As in source. |
| 6 Labels | none | - | Table only, as in source. |
| 7 Limits | `s7-2d-fallback.png` | `Sim/acceptance-evidence/k1-2/07-2d-fallback.png` | As in source. Its banner says the orthoimage is not in use. |

## Source check

- Re-read `slides-en.md`, `project-page-en.md` and `Sim/DEMO_NOTES.md`. No factual error found; `slides-en.md` was not changed.
- The numbers on slides 4 to 6 (14.1 / 9.8 / 10.1 degrees, 0.78 m apex, 1.3 s airtime, 0.69 km, 0.8 vs 1.2 m/s) match `DEMO_NOTES.md`.

## Still to do (human)

1. Fill the placeholders: `[TEAM NAME]`, `[MEMBER NAMES]` (slide 1), and `[LIVE DEMO URL]`, `[REPO URL]` (slide 7). Do not invent names or links.
2. Check the look in PowerPoint or Google Slides; Calibri is used, so widths should match. Check the title wraps on slides 1 and 2.
3. Decide on the screenshots: they show the app's Turkish interface. Captions are in English. If time allows, replace them with English-UI screenshots (same files, same slide positions).
4. Keep the deck at 7 slides or fewer.
5. Export to PDF or Google Slides and make the link public. Test the link in a private window.
6. Confirm the official submission rules still say English and up to 7 slides (see `submission-checklist-en.md`).

## Not verified

- Rendering in Microsoft PowerPoint on this machine was checked through COM export only; not opened in Google Slides, Keynote or LibreOffice.
- Speaker notes were checked by text count only (every slide has notes), not read aloud.
- The 614 KB title screenshot is above the ~400 KB target. It was kept as the first-person view with route ribbon, as requested. The whole .pptx is 1.46 MB.
