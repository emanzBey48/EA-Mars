# Marswalk: 30-second demo video (English)

**Limit:** 30 seconds or less. Verify the official limit on the project submission guide (see `submission-checklist-en.md`). The script below runs 30.0 seconds.

**Voice-over word count:** 62 words (natural pace about 2.5 words per second, so about 25 seconds of speech plus pauses). Placeholders such as `[TEAM NAME]` are counted as words.

**Recording setup:**
- Start the server with `npm start`, then record Chrome or Edge at 1920x1080, in a window that has WebGL2.
- Open `http://127.0.0.1:8080/?demo=1`. Wait until the status line shows the route is calculated before you start the take.
- Do not show the "arrived" banner. It was not observed in the final acceptance run (see `Sim/stage-final-acceptance.md`).
- Do not show frame rate numbers. No single benchmark has been published yet.

---

## Timed script

| Time | Screen | Voice-over | Action |
|---|---|---|---|
| 0:00 to 0:03 | Title card | "Team [TEAM NAME]. Members: [MEMBER NAMES]." (5 words) | No app. Show team name and members on screen. |
| 0:03 to 0:06 | Challenge card | "Challenge: Interplanetary Survival Guide: Martian Map." (7 words) | No app. Show the challenge name on screen. |
| 0:06 to 0:10 | Demo page, presentation mode | "Walk Jezero crater in first person, on real NASA HiRISE terrain." (11 words) | Show the page loaded with `?demo=1`. |
| 0:10 to 0:15 | Minimap with route | "The planner finds a route and scores it for slope and roughness." (12 words) | Click **Örnek Görevi Başlat (Sol 120 → Sol 164)** (Start sample mission). Show the route on the minimap and the summary. |
| 0:15 to 0:22 | 3D first-person walk, route ribbon, footprints | "Walk with W-A-S-D. Footprints and the route ribbon guide you." (11 words) | Hold **W** for about 4 seconds. Optional: tap **Space** for a short hop. |
| 0:22 to 0:26 | Minimap, global and local view | "The minimap shows Mars context. Scores are planning aids, not safety advice." (12 words) | Click **Mars globali göster** (Show global Mars), then **Kapsama sığdır** (Fit to coverage). |
| 0:26 to 0:30 | End card | "Try it yourself. Links below." (5 words) | No app. Show the link placeholders. |

**Voice-over total:** 62 words.

---

## End card (on screen)

- Team: [TEAM NAME]
- Live demo: [LIVE DEMO URL]
- Code: [REPO URL]
- Sources and limits: see the project page

---

## Captions (English subtitles, SRT format)

Use these lines as the English subtitle file. Save as `video-captions-en.srt` next to the video, or paste the text into the video platform's caption editor.

```
1
00:00:00,000 --> 00:00:03,000
Team [TEAM NAME]. Members: [MEMBER NAMES].

2
00:00:03,000 --> 00:00:06,000
Challenge: Interplanetary Survival Guide: Martian Map.

3
00:00:06,000 --> 00:00:10,000
Walk Jezero crater in first person, on real NASA HiRISE terrain.

4
00:00:10,000 --> 00:00:15,000
The planner finds a route and scores it for slope and roughness.

5
00:00:15,000 --> 00:00:22,000
Walk with W-A-S-D. Footprints and the route ribbon guide you.

6
00:00:22,000 --> 00:00:26,000
The minimap shows Mars context. Scores are planning aids, not safety advice.

7
00:00:26,000 --> 00:00:30,000
Try it yourself. Links below.
```

---

## Shot list and app actions

| Shot | URL or action | On-screen control (English meaning) | Keys |
|---|---|---|---|
| Open | `http://127.0.0.1:8080/?demo=1` | Presentation mode opens (`demo=1` or `presentation=1`) | none |
| Start route | Click **Örnek Görevi Başlat (Sol 120 → Sol 164)** | Start sample mission, Sol 120 to Sol 164 (`btn-demo-tour`) | none |
| Switch view if needed | Click **2D / 3D Görünüm** | Switch between 2D and 3D (`btn-demo-toggle-view`) | none |
| Walk | Click the scene once, then hold the key | Walk (first-person view needs the scene focused) | **W**, **A**, **S**, **D** (or arrow keys) |
| Hop (optional) | Keep focus on the scene | Small scenario hop | **Space** |
| Global minimap | Click **Mars globali göster** | Show global Mars (Viking context) (`minimap-fit-global`) | none |
| Local minimap | Click **Kapsama sığdır** | Fit to coverage (Jezero view) (`minimap-fit`) | none |
| Route preference (optional) | Choose **En Düz / Düşük Eğim** in **Rota tercihi** | Route preference: flattest | none |
| Restart (not in the cut) | Click **Başa Dön** or press **R** | Restart the simulation (`btn-demo-restart`) | **R** |
| Pause (not in the cut) | Press **P** | Pause or resume | **P** |

**Notes for the recording:**
- The **Mars globali göster** button is disabled in the page's initial HTML (`public/index.html`). If it stays grey, wait for the minimap to finish loading before clicking it. The enabling condition was not checked in detail.
- The walk and footprints look best after 3 to 4 seconds of holding **W**. Acceptance measured 11 footprints after 3.5 seconds of walking (see `Sim/stage-final-acceptance.md`, F1). The footprint visual was not checked by eye in that run.
- Keep the 1x vertical scale (default). Do not use `?scale=3` in the video, because the 3x view is a labeled exaggeration.
