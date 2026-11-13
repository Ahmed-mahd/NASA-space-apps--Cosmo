// Cuts the raw research downloads in data/ into small replay clips in src/data/clips/.
// Usage: node scripts/cut-clips.mjs <dataDir>
//   <dataDir>/mmash/DataPaper/user_22/*.csv   (from MMASH.zip)
//   <dataDir>/bidmc_0N_Numerics.csv           (BIDMC, PhysioNet)
//   <dataDir>/osd/LSDS-8_*_SUBMITTED.csv      (OSD-575, from download.zip)
// Raw files stay out of git; only the clips this script writes are committed.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const dataDir = resolve(process.argv[2] ?? "data");
const outDir = resolve("src/data/clips");
mkdirSync(outDir, { recursive: true });

const csv = (p) => {
  const lines = readFileSync(p, "utf8").replace(/^﻿/, "").trim().split(/\r?\n/);
  const head = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = l.split(",");
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
};
const num = (v) => {
  const n = Number(v);
  return v === "" || Number.isNaN(n) ? null : n;
};
const r1 = (n) => (n == null ? null : Math.round(n * 10) / 10);
// seconds since day-1 midnight
const secOf = (day, time) => {
  const [h, m, s] = time.split(":").map(Number);
  return (Number(day) - 1) * 86400 + h * 3600 + m * 60 + (s ?? 0);
};
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/* ---------------- MMASH user_22: heart rate, HRV, activity ---------------- */
const USER = "user_22";
const u = join(dataDir, "mmash", "DataPaper", USER);

// Heart rate + steps per second (device spikes removed: plausible range, then 5-s median)
const acti = csv(join(u, "Actigraph.csv"));
const hrBySec = new Map();
const stepsBySec = new Map();
for (const r of acti) {
  const t = secOf(r.day, r.time);
  const hr = num(r.HR);
  if (hr != null && hr >= 35 && hr <= 200) hrBySec.set(t, hr);
  stepsBySec.set(t, (stepsBySec.get(t) ?? 0) + (num(r.Steps) ?? 0));
}

// Beat-to-beat intervals -> RMSSD (ms) over a rolling 60-s window, sampled each second
const rr = csv(join(u, "RR.csv"))
  .map((r) => ({ t: secOf(r.day, r.time), ibi: num(r.ibi_s) }))
  .filter((b) => b.ibi != null && b.ibi >= 0.3 && b.ibi <= 2.0);
function rmssdAt(t, win = 60) {
  // binary search the first beat in window
  let lo = 0, hi = rr.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (rr[mid].t < t - win) lo = mid + 1; else hi = mid; }
  let sum = 0, n = 0;
  for (let i = lo + 1; i < rr.length && rr[i].t <= t; i++) {
    const d = (rr[i].ibi - rr[i - 1].ibi) * 1000;
    if (Math.abs(d) < 200) { sum += d * d; n++; }
  }
  return n >= 20 ? Math.sqrt(sum / n) : null;
}

function series(start, len) {
  const hr = [], hrv = [], steps = [];
  let lastHr = null, lastHrv = null;
  for (let i = 0; i < len; i++) {
    const t = start + i;
    const win = [];
    for (let k = -2; k <= 2; k++) { const v = hrBySec.get(t + k); if (v != null) win.push(v); }
    const h = win.length ? median(win) : lastHr;
    const v = rmssdAt(t) ?? lastHrv;
    hr.push(r1(h)); hrv.push(r1(v)); steps.push(stepsBySec.get(t) ?? 0);
    lastHr = h; lastHrv = v;
  }
  return { hr, hrv, steps };
}

// Live clip: day 1, 10:00:00 to 10:30:00 (seated work, awake)
const LIVE_START = secOf(1, "10:00:00");
const live = series(LIVE_START, 1800);

// Baseline history: one value per awake minute, day 1 09:15 to day 2 00:59 (before sleep onset)
const histStart = secOf(1, "09:15:00"), histEnd = secOf(2, "00:59:00");
const history = { hr: [], hrv: [], steps: [] };
for (let t = histStart; t < histEnd; t += 60) {
  const hrs = [], steps = [];
  for (let s = 0; s < 60; s++) {
    const v = hrBySec.get(t + s); if (v != null) hrs.push(v);
    steps.push(stepsBySec.get(t + s) ?? 0);
  }
  if (hrs.length < 20) continue;
  history.hr.push(r1(median(hrs)));
  history.hrv.push(r1(rmssdAt(t + 59, 60)));
  history.steps.push(steps.reduce((a, b) => a + b, 0));
}

const sleep = csv(join(u, "sleep.csv"))[0];
const q = csv(join(u, "questionnaire.csv"))[0];
const info = csv(join(u, "user_info.csv"))[0];

const mmash = {
  source: "MMASH (Multilevel Monitoring of Activity and Sleep in Healthy people), PhysioNet",
  url: "https://physionet.org/content/mmash/1.0.0/",
  subject: USER,
  profile: { sex: info.Gender, age: num(info.Age), weightKg: num(info.Weight), heightCm: num(info.Height) },
  note: "Heart rate spikes outside 35-200 bpm removed and 5-second median applied. HRV is RMSSD over a rolling 60-second window of beat-to-beat intervals.",
  live: { startClock: "10:00:00", hz: 1, ...live },
  history: { everyMinutes: 1, ...history },
  sleep: {
    inBed: sleep["In Bed Time"], outBed: sleep["Out Bed Time"],
    totalSleepMin: num(sleep["Total Sleep Time (TST)"]), efficiency: num(sleep.Efficiency),
    awakenings: num(sleep["Number of Awakenings"]), wasoMin: num(sleep["Wake After Sleep Onset (WASO)"]),
  },
  questionnaire: {
    dailyStress: num(q.Daily_stress), stai1: num(q.STAI1),
    panasPositive: num(q["panas_pos_10"]), panasNegative: num(q["panas_neg_10"]),
  },
};

/* ---------------- BIDMC: SpO2 and breathing rate ---------------- */
const bidmc = {
  source: "BIDMC PPG and Respiration Dataset, PhysioNet",
  url: "https://physionet.org/content/bidmc/1.0.0/",
  note: "8-minute ICU recordings at 1 Hz. Missing values are null. Breathing rates below 6/min treated as sensor artifacts (null).",
  records: {},
};
for (const id of ["01", "02", "03", "04", "05"]) {
  const rows = csv(join(dataDir, `bidmc_${id}_Numerics.csv`));
  const col = (k) => rows.map((r) => num(r[k]));
  bidmc.records[id] = {
    hr: col("HR"),
    spo2: col("SpO2"),
    resp: col("RESP").map((v) => (v != null && v < 6 ? null : v)),
  };
}

/* ---------------- OSD-575: Inspiration4 metabolic panel ---------------- */
const KEEP = {
  GLUCOSE: "glucose", CREATININE: "creatinine", "UREA NITROGEN (BUN)": "bun",
  CALCIUM: "calcium", POTASSIUM: "potassium", SODIUM: "sodium",
};
const ORDER = ["L-92", "L-44", "L-3", "R+1", "R+45", "R+82", "R+194"];
const osdRows = csv(join(dataDir, "osd", "LSDS-8_Comprehensive_Metabolic_Panel_CMP.upload_SUBMITTED.csv"));
const analytes = {};
for (const r of osdRows) {
  const key = KEEP[r.ANALYTE];
  if (!key) continue;
  const a = (analytes[key] ??= { label: r.ANALYTE, units: r.UNITS, rangeMin: num(r.RANGE_MIN), rangeMax: num(r.RANGE_MAX), crew: {} });
  (a.crew[r.SUBJECT_ID] ??= {})[r.timepoint] = num(r.VALUE);
}
const osd = {
  source: "NASA OSDR OSD-575, SpaceX Inspiration4 comprehensive metabolic panel (LSDS-8)",
  url: "https://osdr.nasa.gov/bio/repo/data/studies/OSD-575",
  note: "Research data from 4 civilian crew. L = days before launch, R = days after return. Ranges are the lab's printed reference ranges. Shown for trend only, not interpreted.",
  timepoints: ORDER,
  analytes,
};

for (const [name, obj] of [["mmash-user22", mmash], ["bidmc", bidmc], ["osd575", osd]]) {
  const p = join(outDir, `${name}.json`);
  writeFileSync(p, JSON.stringify(obj));
  console.log(p, (JSON.stringify(obj).length / 1024).toFixed(1) + " KB");
}
console.log("history minutes:", history.hr.length, "live nulls hr/hrv:", live.hr.filter((v) => v == null).length, live.hrv.filter((v) => v == null).length);
