# Submission checklist for tonight (human)

Work through this list in order. Items marked **VERIFY** are rules or facts that could not be confirmed from the official pages. Check each one on the official page before you rely on it.

---

## 1. Deadline and submit button

- [ ] **VERIFY** the deadline on the team page, Project tab. The repository notes give 15 November 2026 at 23:59 local time, but this came from a search summary, not the official page. Confirm the time zone shown on the site.
- [ ] **VERIFY** the exact button label. The intended action is **Submit to Global Judging**.
- [ ] Submit at least 1 hour before the deadline, so there is time to fix a broken link.

## 2. Demo: choose one format

The official limit, as summarized in the search results, is **either a video of 30 seconds or less, or a slide deck of up to 7 slides**. Exceeding it makes the project ineligible for Global Judging. The earlier plan of a 2 to 3 minute video does not fit this limit.

- [ ] **VERIFY** the limit on the project submission guide.
- [ ] Option A (video): use `video-script-30s-en.md`. The script runs 30.0 s. Voice-over is 62 words. Check the total length after recording, including the end card.
- [ ] Option B (slides): use `slides-en.md`. It has exactly 7 slides, title and intro included. Do not add a slide.
- [ ] Do not submit both as the demo unless the rules allow it. **VERIFY**.

## 3. English everywhere

The official rule, as summarized, says the project page and any linked material must be in English. A video in another language needs English subtitles. A slide deck must be in English.

- [ ] Project page text: use `project-page-en.md`.
- [ ] Slides: use `slides-en.md`.
- [ ] Video: English voice-over or English subtitles. The caption lines (SRT format) are in `video-script-30s-en.md`. Save them as a `.srt` file when uploading.
- [ ] **OPEN QUESTION:** The app's on-screen buttons and labels are in Turkish (`public/index.html`). The app is also linked from the repo. Decide how to handle this before the deadline. Options: an English video that shows the Turkish buttons with the English captions, or a translated UI (not possible tonight). **VERIFY** whether the official rule covers the app UI.
- [ ] **OPEN QUESTION:** The repository documents are in Turkish (`Sim/README.md`, `Sim/DEMO_NOTES.md`, `Sim/SOURCES.md`, and the reports). If the repo link is in the submission, judges may read Turkish. The English quick start is `README_EN.md`. Consider putting it at the repo root (a decision for the team).

## 4. Hosting the video or slides

- [ ] Host the video or the slide deck externally (for example YouTube, Google Drive or GitHub). Files are not uploaded to the submission form. **VERIFY** the requirement.
- [ ] The link must be public and must not need a login or sign-up. **VERIFY** whether "unlisted" is acceptable.
- [ ] Open the link in a **private browser window** and confirm that it plays or opens without signing in.
- [ ] Put the link into the placeholder `[VIDEO/SLIDES URL]` in `project-page-en.md`.

## 5. Team name, members and challenge at the start

- [ ] Video: the first 3 seconds show the team name and member names. The next 3 seconds show the challenge. The script already does this.
- [ ] Slides: slide 1 shows the team name, the member names and the challenge name.
- [ ] Project page: the first lines show the team name, the member names and the challenge. The file already does this.
- [ ] Replace these placeholders with the real values: `[TEAM NAME]`, `[MEMBER NAMES]`, `[REPO URL]`, `[VIDEO/SLIDES URL]`, `[LIVE DEMO URL]`. Also check the one line marked `[TEAM TO CONFIRM this wording]` in the project page.
- [ ] **VERIFY** the challenge title. The official list was not read. The title used everywhere is "Interplanetary Survival Guide: Martian Map", as supplied.

## 6. Citing sources

- [ ] **VERIFY** that the official rule requires citing every source, including open and free ones.
- [ ] Link `sources-en.md` from the project page (already done in the project page text).
- [ ] Viking MDIM 2.1 license: the source states no license. Confirm on the USGS page before submitting, or keep the "not stated in the source" wording (open item K1-4).
- [ ] PIA19400: copy the credit line from the NASA Photojournal page. It is not stored in the repository.
- [ ] Do not add any license that is not stated in the source.

## 7. Team size

- [ ] **VERIFY** the maximum team size on the official page (the summary says 6).
- [ ] The repository's system prompt describes a two-person team. Confirm the members listed on the team page match the real team.

## 8. Repository link

- [ ] The repository root has no `README.md` and no `LICENSE` file. Only `Sim/README.md` exists (in Turkish). Decide whether to add a root README and a license. This is a team decision.
- [ ] **VERIFY** that the repository is public and that a judge can open it without asking for access.
- [ ] The large data files (IMG, JP2 and F32) are stored with Git LFS. A plain clone without LFS shows 132-byte pointers. The README explains `git lfs pull`.

## 9. Live demo link (optional)

- [ ] The app is a Node.js server (`npm start`). It is not a plain static page, so a static host will not run it. Hosting is **not verified** in this repository.
- [ ] If there is no live link, remove the `[LIVE DEMO URL]` line and point to the video, the slides and the repository instead.
- [ ] If there is a live link, test it in a private window and check that the page loads with `?demo=1`.

## 10. AI-assisted development statement

- [ ] The statement in `project-page-en.md` says AI coding assistants were used (the commit history names OpenAI Codex, Anthropic Claude and Antigravity). Check that this matches what the team did, then confirm the official rule on AI disclosure. **VERIFY**.

## 11. Things the project must NOT claim

Check every sentence in the slides, the video and the project page before you submit.

- No live NASA telemetry, and no "real-time NASA data". The simulation clock is a scenario clock.
- No "safe route", no safety score, no safety certificate, no "validated for astronauts or rovers".
- No real rover track or human route. PLACES was not used.
- No atmospheric drag, and no claim that atmosphere affects movement.
- No "ortho" for the DTM hillshade, and no claim that the ortho is aligned (alignment is +/-1.5 m on the analysis window only, and half-pixel alignment is not proven).
- No Viking terrain colors. Viking is a processed color product at 232 m/px.
- No measured Jezero gravity. The 3.71 m/s² value is a rounded global reference.
- No frame-rate number. The repository has conflicting values (82 to 88 FPS in one headless run, 23 to 30 FPS under load in another). A single benchmark is not published yet.
- No license that is not stated in the source.

## 12. Questions judges may ask (answers are in the repository)

Use the answers in `Sim/DEMO_NOTES.md` section 5. The most likely questions:
- "Is this a real Mars walk?" No. It is a user-controlled exploration simulation.
- "Is the route safe?" No. It is a planning aid, and the thresholds are scenario parameters.
- "Which terrain are you showing?" The legacy HiRISE DTM fallback. The newer USGS window is flagged `needs_review`.
- "Is the ortho aligned to the terrain?" Measured only on the analysis window. Not proven for the displayed terrain.
- "Why is the flattest route not always the flattest?" The preference name describes an intent. In one run, its maximum slope was higher than the balanced route on the displayed DTM (10.1 degrees against 9.8).

## 13. Last check before pressing submit

- [ ] No placeholder text is left in any file (search the four files for `[`).
- [ ] The video, the slides and the project page say the same thing about the terrain, the limits and the numbers.
- [ ] The numbers match `Sim/DEMO_NOTES.md`.
- [ ] No personal data (email, phone, home path) is in any file.
- [ ] All links open in a private window.
