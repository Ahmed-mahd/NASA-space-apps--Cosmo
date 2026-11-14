# COSMO: handoff for Claude Code

Read this first, then `docs/WALKTHROUGH.md` (structure, data plan, phases, checkpoints). Also follow `AGENTS.md` (this Next.js version has breaking changes; check `node_modules/next/dist/docs/` before using a Next API).

## What this is
NASA Space Apps Cairo 2026 hackathon entry. Team of six led by Ahmed. Build ends **Sat 14 Nov 08:00 Cairo**; submission 13:00 (30-second video or 7 slides, public link, public repo, AI use disclosed).
Live site: https://cosmo-health.vercel.app/ (Vercel auto-deploys every push to `main`).

Cosmo is a **voice-only** AI health companion that lives in an astronaut's IoT glove and projects a hologram screen at the wrist. A band and a smart shirt supply readings. It covers physical and mental health, has a real sense of humor, and guides approved self-checks. The demo runs online; the product is designed for a local model (Qwen) onboard. No hardware is built; the website simulates everything.

## Decisions already made (do not reopen)
- **Three layers, one-way flow:** sensors → learning (personal baseline, deviation scores) → rules (read-only versioned IF–THEN file → severity green/yellow/orange/red + next approved step) → voice (language model only words things and parses speech). The model never picks a medical action. Learning never edits protocols.
- **TRY → OBSERVE → REASSESS** loops over learning + rules.
- **Humor follows severity:** on at green, gentle at yellow, off at orange/red.
- **Crewmate:** assume the astronaut is alone; at orange/red ask if a crewmate is present and address them directly as an assistant.
- **Voice only.** Browser speech recognition and speech output, Chrome. Hidden presenter buttons are the approved safety net.
- **Model adapter:** OpenAI-compatible chat format so a hosted API and Ollama+Qwen are a settings swap. Key lives in Vercel env vars, never in chat or the repo.
- **Thresholds** are labeled "example protocol, needs medical review". NASA pages give almost no numeric limits.
- **Approved actions** come from the `countermeasures` NASA lists on each risk page (`src/data/nasa.ts`).
- **Scenarios:** (1) fatigue and headache from mild hypoxia; (2) flank pain → kidney ultrasound check (Butterfly iQ+ as the named device, NASA AMOS as precedent) with a procedure video or animated steps, crewmate helps.
- **Enhancements approved:** clickable hologram body mapped to the 17 NASA risks; "Why did Cosmo say that?" panel; Earth-delay comparison; daily quests and streaks; flight surgeon report on sync.
- **Stack:** Next.js (App Router) on Vercel, Three.js via @react-three/fiber, Recharts, self-hosted Geist fonts (`geist` package; Google Fonts fetch fails in sandboxes), browser storage with a visible sync queue.

## Data sources
Keep: NASA HRP hazards, risks (+17 reference pages), ongoing research; CSA radiation article; CSA science page (all five official resources are in `src/data/nasa.ts`); NASA-STD-3001 Vol 1 §3.0; NASA OCHMO medical operations page; OSD-575 (Inspiration4 metabolic panel); MMASH; BIDMC; WESAD (cite, data only if time); MedQuAD and fedmml-ed-triage (optional).
Dropped: OSD-53, 195, 918, 919, 923, 952, 1018; PPG-DaLiA; MHEALTH; MedDialog; MediTOD; SLURP; DSO 470 (not found).
Extra precedent to cite: Astroskin/Bio-Monitor smart shirt (NASA + CSA).

## State at handoff (Fri 20:35)
Done: app scaffold, landing page with glove + hologram (`src/components/GloveScene.tsx`), empty `/cosmo` shell, NASA knowledge base, walkthrough, Vercel live.
Next (Phase 1 close → Phase 2): `src/lib/stream.ts`, `src/lib/baseline.ts`, vitals tiles and charts, body map, mission bar. Use a generated placeholder stream until the team supplies files.

## State (Sat 01:45)
- `/` landing: 3D space (procedural Earth), Figma astronaut rig facing Cosmo; tap the wrist hologram -> compositor-only zoom into the device (device mounts during the zoom; code + body mesh preloaded on idle).
- Device body: real human mesh, MakeHuman base (CC0) baked by `scripts/bake-body.mjs data/makehuman` into `public/models/body.bin` (13,380 verts, 314 KB). Hologram skin + wireframe + point cloud; zones tint orange (minor) / red (major); organs inside; region markers projected from 3D.
- Voice: `lib/voice.ts` (Chrome speech in/out, 3 voices), `lib/brain.ts` (on-board dialogue manager: intents, pending questions, TRY->OBSERVE->REASSESS via fast-forward), `lib/useConversation.ts`, `app/api/cosmo/route.ts` (OpenAI-compatible adapter, env vars below; rewords only, falls back to the on-board draft). Demo conversations: hypoxia and flank pain (crewmate + guided kidney scan, `ScanCard.tsx`).
- Mind deck (`MindDeck.tsx`): voice check-in + mood weather, joke break, space trivia (NASA facts), box breathing, Earth window, voice journal.
- Rules draft in `lib/conditions.ts` still needs Checkpoint C review. Presenter: Shift+P (scenarios, speed, typed backup line).
- No model key set yet: the brain runs fully on board ("on-board scripted").

## State (Sat, voice update)
- "Hey Cosmo" wake word: `lib/voice.ts` runs Chrome speech recognition continuously, wakes on the phrase (`lib/wake.ts`, loose match for cosmos/kosmo/cozmo), keeps listening 7-14 s after each answer, pauses while anything is spoken. Orb (`VoiceOrb.tsx`) follows the live mic spectrum; text box (`VoicePanel.tsx`) is separate and has yes/no tap buttons as a fallback.
- Brain rewrite (`lib/brain.ts`): ~60 intents; feelings are explored before suggesting (cause -> how long -> what helps -> plan, details never logged); crisis path; chest pain; generic emergency triage; yes/no-only questions when the astronaut is alone (`ALONE_CHECKS` in `conditions.ts`).
- Proactive check-ins: `lib/watch.ts` (deviation from personal normal + 90-s oxygen trend forecast); cooldowns in `DeviceOS.tsx`. New scenario phase "stress". Four demo conversations.
- Tests: `npm test` (node:test + jiti, 148 cases in `src/lib/brain.test.ts`). vitest could not be downloaded here.
- Voice debugging: Chrome lets only ONE tab run speech recognition; two Cosmo tabs cancel each other ("aborted" loop), so the focused tab claims the mic and others step back. In dev the console logs every recognizer event as `[cosmo-voice]` (in production set localStorage `cosmo.debug` = "1"); `window.__cosmoVoice.hear(text)` feeds words as if heard. Speaker playback can't be used to test the mic (the laptop's echo cancellation removes it); test with a real voice.
- Checkpoint C now also covers R-MIND-01, R-MIND-02, R-CHEST-01, R-GLU-01 (finger-stick glucose) and the yes/no question lists.

## State (Sat, agent update)
- Turn-taking (`voice.ts`): a turn ends after a real pause (longer after "and", "I was", a bare "no"); recognition keeps running while Cosmo speaks, Cosmo's own voice is filtered out, and the astronaut can talk over Cosmo (it stops and listens). Patience grows when Cosmo is interrupted right after answering.
- Agent (`app/api/cosmo/route.ts`): "chat" mode answers anything unscripted with history + memory + readings + approved steps; whitelisted non-medical actions only; drug/dose replies discarded. Reads `GROQ_API_KEY` (or the COSMO_MODEL_* vars) and picks a model automatically. Needs the code pushed to work on Vercel; locally add the key to `.env.local`.
- Memory (`lib/memory.ts`, browser storage): name, family, likes, what helped, recurring topics, joke taste, episodes; shown in the Log drawer; "what do you remember about me" / "forget everything".
- Dev test hook: `window.__cosmoVoice.say(text, {pauses: {wordIndex: ms}})` streams words like Chrome; used to simulate the astronaut before real-voice tests.

## State (Sat, AI-first agent)
- `lib/agent.ts` decides who answers each turn. The on-board brain always runs first, then: **exact** (emergencies, crisis, yes/no flows, procedures, symptoms, jokes: never sent to the model), **reword** (readings and health advice: model rephrases, numbers checked), **agent** (everything else: the model leads, the brain's reply is only a suggestion; `follow:false` drops the script). During an alert the agent only answers when the brain has nothing.
- `app/api/cosmo/route.ts`: reads `GEMINI_API_KEY`, `GROQ_API_KEY` or `COSMO_MODEL_BASE_URL`+`COSMO_MODEL_API_KEY`; `COSMO_MODEL_NAME` is a model id (a key pasted there is ignored and never shown). One retry, drug/dose replies discarded, action whitelist, `?models=1` lists usable models. Errors show in the browser console as `[cosmo-agent]`.
- Learning: the model returns `remember` facts (including preferences and corrections) that go into `lib/memory.ts`; "remember that ..." works offline.
- Tested with a local stand-in model (no real key on this machine); the real model is tested by Ahmed on the live site.

## Answers from Ahmed (Fri 20:35)
- **Scenario 1 is the mild-hypoxia story.** The astronaut reports fatigue and headache; SpO2 drifts below their personal baseline; Cosmo asks follow-ups, runs an approved check, reassesses. Source: NASA hypoxia risk page (symptoms: confusion, headache, vision problems, trouble sleeping).
- **Nobody on the team is medically trained.** So: keep the rule file small and conservative, use only widely published reference ranges, show "example protocol, needs medical review" on every rule and in the "Why did Cosmo say that?" panel, never name a drug or dose, and say this limit plainly in the README. Suggest Ahmed ask a hackathon mentor to look over the rule file at Checkpoint C.
- **Model provider not chosen yet.** Build the adapter around three env vars so any provider works: `COSMO_MODEL_BASE_URL`, `COSMO_MODEL_API_KEY`, `COSMO_MODEL_NAME`. For local Qwen: base URL `http://localhost:11434/v1`, any key, model `qwen2.5` (check the current Ollama tag). Until a key exists, fall back to scripted replies so the demo still runs.

## Waiting on the team
- MMASH zip, `bidmc_01..05_Numerics.csv`, OSD-575 metabolic panel file → cut into `src/data/clips/`. Sources: physionet.org/content/mmash/1.0.0/ , physionet.org/files/bidmc/1.0.0/bidmc_csv/ , osdr.nasa.gov/bio/repo/data/studies/OSD-575 (Files tab).
- Model provider and key (added in Vercel → Settings → Environment Variables).
- Checkpoint A: approve the 11 body regions and the signal table (walkthrough §2d).
- Full research notes with source links (ultrasound devices, source verdicts, design) live in Ahmed's Claude project, not in this repo. Ask him to paste them when writing `docs/RESOURCES.md`.

## Working rules
- Treat Ahmed as the senior engineer: consult at each checkpoint in the walkthrough.
- Each phase ends with `npm run build` passing, a commit, and a push.
- Paraphrase sources and keep the source link on every knowledge entry.
- Label simulated data as simulated on screen.
