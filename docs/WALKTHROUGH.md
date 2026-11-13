# COSMO build walkthrough

From Friday 19:53 to submission on Saturday 13:00 (Cairo time). Build ends at 08:00.
Each phase ends with a pushed commit and a working live link. **Checkpoint** marks a decision the team lead approves before the next step starts.

- Repo: https://github.com/Ahmed-mahd/NASA-space-apps--Cosmo
- Design: `claude/cosmo-design.md` in the Claude project
- Source verdicts: `claude/data-sources-verdicts.md` in the Claude project

## 1. How the app is structured

```
src/
  app/
    page.tsx              Landing page (glove + hologram)
    cosmo/page.tsx        The Cosmo interface (dashboard, body map, voice)
    api/cosmo/route.ts    Server route that calls the language model   [Phase 3]
  components/             Screen pieces (glove scene, vitals, body map, panels)
  data/
    nasa.ts               Knowledge base from the official challenge resources  [done]
    clips/                Replay clips cut from MMASH, BIDMC, OSD-575           [Phase 2]
    protocols.json        Read-only, versioned IF–THEN rules with sources       [Phase 3]
    procedures.ts         Step-by-step self-checks (incl. ultrasound)           [Phase 4]
  lib/
    stream.ts             Replays sensor clips as a live feed                   [Phase 2]
    baseline.ts           Learning layer: personal baseline + deviations        [Phase 2]
    rules.ts              Rules layer: deviations + symptoms → severity + step  [Phase 3]
    loop.ts               TRY → OBSERVE → REASSESS state machine                [Phase 3]
    model.ts              Model adapter: hosted API or local Qwen via Ollama    [Phase 3]
    voice.ts              Speech in and speech out (browser)                    [Phase 3]
    store.ts              Local records + "waiting to sync" queue               [Phase 4]
docs/
  WALKTHROUGH.md          This file
  RESOURCES.md            Every dataset, source and tool, for the submission    [Phase 5]
```

### The three layers (who is allowed to decide what)

| Layer | File | Decides | Can change itself |
|---|---|---|---|
| Learning | `lib/baseline.ts` | How far each reading is from this astronaut's normal | Yes, with every reading |
| Rules | `lib/rules.ts` + `data/protocols.json` | Severity level and the next approved step | No. New version only |
| Voice | `lib/model.ts` + `lib/voice.ts` | The words Cosmo says, and what the astronaut meant | No |

Data flows one way: sensors → baseline → rules → voice. The language model never picks a medical action.

## 2. Data plan

### 2a. Official challenge resources (all five used)

| Resource | Where it lives in the app | Status |
|---|---|---|
| NASA HRP Hazards | `nasa.ts → hazards`. Mission environment selector and hazard chips | Done |
| NASA HRP Risks (17 risks + each reference page) | `nasa.ts → risks`. Body map, "learn more" cards, and the countermeasures that seed Cosmo's approved actions | Done |
| NASA HRP Ongoing Research | `nasa.ts → studies`. "Built on NASA research" strip; ARCHeR, Standard Measures and Tempus Pro cited as precedent | Done |
| CSA radiation monitoring article | `nasa.ts → csa.radiation`. Radiation tile | Done |
| CSA "why science in space" | `nasa.ts → csa.science`. Landing page "why this matters on Earth" line | Done |

Rule for this file: every entry is paraphrased, carries its source link, and separates NASA's statements from our own design mapping (`cosmo.signals`).

### 2b. Other NASA sources

| Source | Use | Status |
|---|---|---|
| NASA-STD-3001 Vol 1, section 3.0 | Cited as the requirement Cosmo answers (assess, record and trend vital signs; autonomous care) | To cite in Phase 5 |
| NASA OCHMO Medical Operations | Cited for AI-assisted care and the crewmate role | To cite in Phase 5 |
| OSD-575 (Inspiration4 blood chemistry) | Lab panel and pre/post-flight trend | Needs the file from the team |
| NASA AMOS, Butterfly iQ on ISS | Ultrasound scenario | Researched |

### 2c. External datasets

| Dataset | Use | Status |
|---|---|---|
| MMASH | Normal-day stream, sleep, mood, baseline | Needs the zip from the team |
| BIDMC | Abnormal readings for scenarios | Needs 4–5 CSV files from the team |
| WESAD | Stress design reference; data only if time allows | Cite only for now |
| MedQuAD | Optional plain-language explanations | Optional |

**Checkpoint A (now):** approve the body-map grouping and the signal list in section 2d.

### 2d. What Cosmo measures, and how

| Indicator | Source in the story | Source in the demo |
|---|---|---|
| Heart rate, HRV, activity, sleep | Band | MMASH replay |
| Breathing rate, SpO2 | Shirt + band | BIDMC replay |
| Skin temperature, stress | Band + shirt | Generated from the clip, labeled simulated |
| Blood pressure, blood glucose | Dedicated cuff and meter, prompted by Cosmo | Spoken by the astronaut or preset in the scenario |
| Mood | Voice check-in | Voice |
| Blood chemistry | Onboard analyzer | OSD-575 |
| Radiation dose | Cabin dosimeter | Simulated, labeled |
| Ultrasound | Handheld probe | Sample image + procedure video |

The challenge names blood pressure, heart rate, blood sugar, body temperature, sleep hours and mood. All six are covered.

## 3. Phases

### Phase 1: Foundation (19:30–21:30)
1. Create the app and the landing page with the glove and hologram. **Done**
2. Push to GitHub. **Done**
3. Build the NASA knowledge base from the official resources. **Done**
4. Connect the repo to Vercel for a live link. *Team lead*
5. Team sends MMASH, BIDMC and OSD-575 files. *Team*
6. Cut the files into small replay clips in `data/clips/`.

Exit: live link opens the landing page.

### Phase 2: Dashboard (21:30–00:00)
1. `stream.ts`: replay a clip at one reading per second.
2. `baseline.ts`: running average and spread per signal; output a deviation score.
3. Vitals tiles with green, yellow, orange, red color coding and trend charts.
4. Hologram body map: 11 regions, 17 NASA risks, each card showing what it is, signs, NASA countermeasures and the source link.
5. Mission bar: environment selector (Earth, Station, Transit, Moon, Mars) and IVA/EVA switch.

**Checkpoint B:** approve the dashboard layout from a screenshot before the body map is wired in.
Exit: live vitals move, tiles change color, body regions open cards.

### Phase 3: Cosmo's mind (00:00–02:30)
1. `protocols.json`: rules for the fatigue-and-headache pathway and the flank-pain pathway. Each rule has an ID, a source and the label "example protocol, needs medical review".
2. `rules.ts` and `loop.ts`: severity and next step; the TRY → OBSERVE → REASSESS loop.
3. `model.ts` and `api/cosmo/route.ts`: one adapter, hosted model now, Qwen through Ollama by changing two settings.
4. `voice.ts`: push-to-talk and wake phrase; Cosmo speaks every reply.
5. Personality: jokes and casual talk at green, gentle at yellow, plain and calm at orange and red.
6. Hidden presenter buttons for each scenario step.

**Checkpoint C:** approve the rule file (thresholds and steps) before it is locked.
**Checkpoint D:** a teammate talks to Cosmo in Chrome and approves the voice and tone.
Exit: scenario 1 runs end to end by voice.

### Phase 4: Critical care (02:30–05:00)
1. `store.ts`: every episode saved locally; Earth-link switch; queue and sync.
2. Flight surgeon report generated when the link returns.
3. Scenario 2: kidney ultrasound check with the procedure video or animated steps.
4. Crewmate mode: Cosmo asks if a crewmate is present and speaks to them directly.
5. "Why did Cosmo say that?" panel: rule ID, readings, source.
6. "What Cosmo learned" panel: baseline before and after; protocol version unchanged.

**Checkpoint E:** approve the procedure content and the wording of every orange and red message.
Exit: both scenarios and the blackout run without a reload.

### Phase 5: Polish (05:00–08:00)
1. Landing page: better glove model, Earth-delay comparison.
2. Daily health quests and streaks.
3. Three full run-throughs in Chrome; fix every bug found.
4. `README.md` and `docs/RESOURCES.md`, including the AI-use disclosure.
5. Feature freeze at 07:30.

**Checkpoint F:** final go or no-go on each enhancement at 06:30.

### After the build (08:00–13:00, team)
1. Record the 30-second video in Chrome.
2. Write the project summary from the README.
3. Check every link opens in a private window with no login.
4. Team lead submits by 12:00.

## 4. Things only the team can do

- Connect Vercel and add the model key in Vercel settings (never in chat or the repo).
- Download and attach the dataset files.
- Test voice with a microphone.
- Find a procedure video you have the right to use.
- Record the video and submit.

## 5. Cut list, in order, if we fall behind

1. Daily quests and streaks
2. Earth-delay comparison
3. Flight surgeon report
4. Moon and Mars differences beyond labels
5. Wake phrase (keep push-to-talk)
