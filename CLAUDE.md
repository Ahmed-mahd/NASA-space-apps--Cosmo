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
- **Scenarios:** (1) fatigue and headache; (2) flank pain → kidney ultrasound check (Butterfly iQ+ as the named device, NASA AMOS as precedent) with a procedure video or animated steps, crewmate helps.
- **Enhancements approved:** clickable hologram body mapped to the 17 NASA risks; "Why did Cosmo say that?" panel; Earth-delay comparison; daily quests and streaks; flight surgeon report on sync.
- **Stack:** Next.js (App Router) on Vercel, Three.js via @react-three/fiber, Recharts, self-hosted Geist fonts (`geist` package; Google Fonts fetch fails in sandboxes), browser storage with a visible sync queue.

## Data sources
Keep: NASA HRP hazards, risks (+17 reference pages), ongoing research; CSA radiation article; CSA science page (all five official resources are in `src/data/nasa.ts`); NASA-STD-3001 Vol 1 §3.0; NASA OCHMO medical operations page; OSD-575 (Inspiration4 metabolic panel); MMASH; BIDMC; WESAD (cite, data only if time); MedQuAD and fedmml-ed-triage (optional).
Dropped: OSD-53, 195, 918, 919, 923, 952, 1018; PPG-DaLiA; MHEALTH; MedDialog; MediTOD; SLURP; DSO 470 (not found).
Extra precedent to cite: Astroskin/Bio-Monitor smart shirt (NASA + CSA).

## State at handoff (Fri 20:30)
Done: app scaffold, landing page with glove + hologram (`src/components/GloveScene.tsx`), empty `/cosmo` shell, NASA knowledge base, walkthrough, Vercel live.
Next (Phase 1 close → Phase 2): `src/lib/stream.ts`, `src/lib/baseline.ts`, vitals tiles and charts, body map, mission bar. Use a generated placeholder stream until the team supplies files.

## Waiting on the team
- MMASH zip, `bidmc_01..05_Numerics.csv`, OSD-575 metabolic panel file → cut into `src/data/clips/`.
- Which model provider; key added in Vercel settings.
- Open question 1: make scenario 1 a mild-hypoxia story (SpO2 drifting below baseline; NASA lists confusion, headache, vision problems, trouble sleeping)? Recommended yes.
- Open question 2: is anyone medically trained to review the rule file?
- Checkpoint A: approve the 11 body regions and the signal table (walkthrough §2d).

## Working rules
- Treat Ahmed as the senior engineer: consult at each checkpoint in the walkthrough.
- Each phase ends with `npm run build` passing, a commit, and a push.
- Paraphrase sources and keep the source link on every knowledge entry.
- Label simulated data as simulated on screen.
