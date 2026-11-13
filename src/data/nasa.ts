/**
 * Knowledge base built from the official NASA Space Apps challenge resources.
 * Every entry is paraphrased from the page in `source` and carries that link,
 * so the app can show "where this comes from" on any screen.
 *
 * Fields under `cosmo` are OUR design mapping (which Cosmo signal relates to
 * the risk). They are not NASA statements.
 */

export type HazardId = "radiation" | "isolation" | "distance" | "gravity" | "environment";
export type BodyRegion =
  | "brain" | "eyes" | "inner-ear" | "heart" | "lungs" | "immune" | "gut-skin"
  | "bones" | "muscles" | "mind" | "whole-body";
export type Signal =
  | "heartRate" | "hrv" | "spo2" | "respRate" | "skinTemp" | "sleep" | "activity"
  | "stress" | "mood" | "bloodPressure" | "glucose" | "radiationDose" | "symptoms" | "ultrasound";

export interface Hazard {
  id: HazardId; name: string; summary: string; facts: string[]; source: string;
}

export const HAZARDS_SOURCE = "https://www.nasa.gov/hrp/hazards/";

export const hazards: Hazard[] = [
  { id: "radiation", name: "Space Radiation",
    summary: "Beyond Earth's magnetic shield, crews are exposed to more ionizing radiation, which raises cancer risk and can affect the nervous system, heart and eyes.",
    facts: ["Neutrons make up about 30% of the radiation on the ISS (Canadian Space Agency)."],
    source: HAZARDS_SOURCE },
  { id: "isolation", name: "Isolation and Confinement",
    summary: "Small groups confined for months or years can develop behavior, mood and sleep problems.",
    facts: ["NASA manages it with careful crew selection, training and support."],
    source: HAZARDS_SOURCE },
  { id: "distance", name: "Distance from Earth",
    summary: "The farther the crew travels, the harder it is to get instructions, supplies and medical care, so crews must plan ahead and be self-sufficient.",
    facts: ["Mars is on average about 140 million miles from Earth.", "A Mars mission would last roughly three years; the Moon is a three-day trip."],
    source: HAZARDS_SOURCE },
  { id: "gravity", name: "Gravity Fields",
    summary: "Muscles, bones, the inner ear and organs must readjust every time gravity changes, including on return to Earth.",
    facts: ["Mars gravity is about three-eighths of Earth's.", "Crews could live on Mars for up to two years."],
    source: HAZARDS_SOURCE },
  { id: "environment", name: "Hostile / Closed Environments",
    summary: "Life in a sealed habitat depends on temperature, pressure, lighting, noise and microbes being kept in check.",
    facts: ["NASA monitors microbial communities and tracks crew immune responses."],
    source: HAZARDS_SOURCE },
];

export interface Risk {
  id: string; name: string;
  group: "physiology" | "behavior" | "radiation";
  region: BodyRegion;
  hazards: HazardId[];
  what: string;
  signs: string[];
  /** Countermeasures NASA names on the risk page. These seed Cosmo's approved-action library. */
  countermeasures: string[];
  numbers: string[];
  source: string;
  cosmo: { signals: Signal[] };
}

export const RISKS_SOURCE = "https://www.nasa.gov/hrp/risks/";
const ref = (slug: string) => `https://www.nasa.gov/reference/${slug}/`;

export const risks: Risk[] = [
  { id: "immune", name: "Altered Immune System Responses", group: "physiology", region: "immune",
    hazards: ["radiation", "gravity", "isolation", "environment"],
    what: "Spaceflight stressors can change how the immune system responds, opening the door to infections, allergic reactions and dormant viruses waking up.",
    signs: ["Cold sores", "Rashes", "Unusual allergies", "Infections"],
    countermeasures: ["Blood, saliva and urine samples tracked before, during and after flight"],
    numbers: [], source: ref("risk-of-altered-immune-system-responses"),
    cosmo: { signals: ["skinTemp", "sleep", "stress", "symptoms"] } },
  { id: "sensorimotor", name: "Altered Sensorimotor and Vestibular Function", group: "physiology", region: "inner-ear",
    hazards: ["gravity"],
    what: "Changing gravity can cause motion sickness and make it hard to stay oriented, which matters for piloting, landing and spacewalks.",
    signs: ["Motion sickness", "Disorientation"],
    countermeasures: ["Medication with training or orientation aids", "Specific head movements being tested to ease symptoms"],
    numbers: ["Most astronauts experience motion sickness in spaceflight."],
    source: ref("risk-of-altered-sensorimotor-and-vestibular-function"),
    cosmo: { signals: ["symptoms", "activity"] } },
  { id: "cardiovascular", name: "Cardiovascular Adaptations", group: "physiology", region: "heart",
    hazards: ["gravity", "radiation"],
    what: "Low gravity can change the heart and blood vessels, with possible clots, irregular rhythms and low blood pressure that can cause fainting at landing.",
    signs: ["Fainting or light-headedness", "Irregular heartbeat"],
    countermeasures: ["Regular exercise", "Healthy diet", "Lower-body compression garments", "High fluid intake before landing", "Ultrasound of the heart"],
    numbers: [], source: ref("risk-of-cardiovascular-adaptations"),
    cosmo: { signals: ["heartRate", "hrv", "bloodPressure", "ultrasound"] } },
  { id: "dcs", name: "Decompression Sickness", group: "physiology", region: "whole-body",
    hazards: ["environment"],
    what: "Moving to a lower-pressure spacesuit can make dissolved nitrogen form bubbles in the blood and tissues.",
    signs: ["Severe pain", "Breathing problems", "Stroke-like symptoms"],
    countermeasures: ["Breathing high-concentration oxygen before a spacewalk", "End the spacewalk and return if symptoms appear", "Variable-pressure suits"],
    numbers: [], source: ref("risk-of-decompression-sickness"),
    cosmo: { signals: ["symptoms", "spo2", "respRate"] } },
  { id: "microbes", name: "Host-Microorganism Interactions", group: "physiology", region: "gut-skin",
    hazards: ["environment"],
    what: "Skin and gut microbes can change in space and some microbes become more harmful, while immunity may also shift.",
    signs: ["Getting sick in flight", "Skin or gut changes"],
    countermeasures: ["Limiting contact with large groups for two weeks before launch", "Biological samples and surface swabs"],
    numbers: ["Two-week pre-launch exposure limit."],
    source: ref("risk-of-host-microorganism-interactions"),
    cosmo: { signals: ["symptoms", "skinTemp"] } },
  { id: "hypoxia", name: "Hypoxia", group: "physiology", region: "lungs",
    hazards: ["environment"],
    what: "Partly depressurized deep-space cabins could leave body tissues with less oxygen than normal.",
    signs: ["Confusion", "Headache", "Vision problems", "Trouble sleeping"],
    countermeasures: ["Protocols balancing oxygen concentration and pressure", "Adjustable-pressure suits", "New health-monitoring protocols"],
    numbers: [], source: ref("risk-of-hypoxia"),
    cosmo: { signals: ["spo2", "respRate", "heartRate", "sleep", "symptoms"] } },
  { id: "nutrition", name: "Inadequate Food and Nutrition", group: "physiology", region: "gut-skin",
    hazards: ["distance", "environment"],
    what: "Without resupply, food must stay safe, nutritious and varied for years, or performance and health decline.",
    signs: ["Menu fatigue", "Eating less"],
    countermeasures: ["Lower sodium", "More food variety", "Nutritionally enhanced diet"],
    numbers: ["More than 200 foods and drinks are available on the ISS."],
    source: ref("risk-of-inadequate-food-and-nutrition"),
    cosmo: { signals: ["glucose", "mood", "symptoms"] } },
  { id: "eva", name: "Injury and Compromised Performance from Spacewalks", group: "physiology", region: "muscles",
    hazards: ["environment", "gravity"],
    what: "Spacewalks are physically and mentally demanding, and suit pressure, suit weight and unfamiliar terrain can injure or exhaust the crew.",
    signs: ["Fatigue", "Pain", "Decompression symptoms"],
    countermeasures: ["Prebreathe protocols", "Suits with biomedical monitoring", "Exercise for bone and muscle strength"],
    numbers: ["Longest spacewalk on record: 8 hours 56 minutes."],
    source: ref("risk-of-injury-and-compromised-performance-from-extravehicular-activity-eva"),
    cosmo: { signals: ["heartRate", "respRate", "skinTemp", "activity"] } },
  { id: "fitness", name: "Reduced Cardiorespiratory and Musculoskeletal Fitness", group: "physiology", region: "muscles",
    hazards: ["gravity"],
    what: "Microgravity wears down bone, muscle and heart-lung fitness, which makes tasks harder and falls more likely.",
    signs: ["Loss of strength and endurance", "Poorer coordination"],
    countermeasures: ["Resistance and aerobic exercise six to seven days a week", "Periodic fitness self-evaluations"],
    numbers: ["Average strength and aerobic fitness loss is 10 to 12% of pre-mission levels.", "Crews exercise about 1.5 hours a day."],
    source: ref("risk-of-reduced-cardiorespiratory-and-musculoskeletal-fitness"),
    cosmo: { signals: ["activity", "heartRate", "hrv"] } },
  { id: "sans", name: "Spaceflight Associated Neuro-ocular Syndrome (SANS)", group: "physiology", region: "eyes",
    hazards: ["gravity"],
    what: "Weightlessness pushes fluid toward the head, which can swell the optic nerve, fold the retina and flatten the back of the eye.",
    signs: ["Vision changes", "Optic nerve swelling on imaging"],
    countermeasures: ["Retinal imaging", "Nutritional supplements under study", "Devices to reverse the headward fluid shift under study"],
    numbers: ["About 70% of ISS astronauts show some swelling at the back of the eye."],
    source: ref("risk-of-spaceflight-associated-neuro-ocular-syndrome-sans"),
    cosmo: { signals: ["symptoms", "ultrasound"] } },
  { id: "bone", name: "Spaceflight-Induced Bone Changes", group: "physiology", region: "bones",
    hazards: ["gravity"],
    what: "Weight-bearing bones in the spine and hips lose density without load, raising fracture and early osteoporosis risk.",
    signs: ["Bone density loss on scans", "Spine lengthening"],
    countermeasures: ["Resistive exercise", "Bisphosphonate medication", "Routine bone scans"],
    numbers: ["Bone density falls about 1 to 1.5% per month on four- to six-month missions.", "Height can increase by up to 3%."],
    source: ref("risk-of-spaceflight-induced-bone-changes"),
    cosmo: { signals: ["activity"] } },
  { id: "behavior", name: "Behavioral Changes and Psychiatric Disorders", group: "behavior", region: "mind",
    hazards: ["isolation", "distance"],
    what: "Long isolation and confinement raise the chance of anxiety, depression and other behavioral problems.",
    signs: ["Low mood", "Anxiety", "Poor sleep", "Low morale"],
    countermeasures: ["Keeping a regular journal", "Growing fresh vegetables", "Windows and views", "Privacy", "Virtual contact with family and medical professionals"],
    numbers: ["Living space roughly the size of a studio apartment for multiple years."],
    source: ref("risk-of-behavioral-conditions-and-psychiatric-disorders"),
    cosmo: { signals: ["mood", "stress", "sleep", "hrv"] } },
  { id: "teamwork", name: "Inadequate Teamwork", group: "behavior", region: "mind",
    hazards: ["isolation", "distance"],
    what: "Communication delays, isolation and tight quarters can break down how a crew works together.",
    signs: ["Conflict", "Withdrawal"],
    countermeasures: ["Team-building practice before flight", "In-mission medical support"],
    numbers: [], source: ref("risk-of-inadequate-teamwork"),
    cosmo: { signals: ["mood", "stress"] } },
  { id: "sleep", name: "Inadequate Sleep and Irregular Schedules", group: "behavior", region: "brain",
    hazards: ["isolation", "environment"],
    what: "Sleep loss, a disrupted body clock and work overload reduce performance and harm health.",
    signs: ["Short sleep", "Fatigue", "Irregular sleep times"],
    countermeasures: ["Lighting that mimics Earth's day and night", "Scheduled relaxation and self-care time", "Managing light and caffeine"],
    numbers: ["ISS crews see 16 sunrises and sunsets a day."],
    source: ref("risk-from-inadequate-sleep-and-irregular-schedules"),
    cosmo: { signals: ["sleep", "hrv", "activity", "stress"] } },
  { id: "systems", name: "Inadequate Systems Operations Support", group: "behavior", region: "brain",
    hazards: ["distance"],
    what: "Far from Earth, crews must find and fix system and equipment problems without real-time help from mission control.",
    signs: [],
    countermeasures: ["Pre-mission training", "User-friendly system design"],
    numbers: ["Astronauts average 300 hours in simulators before launch."],
    source: ref("risk-of-inadequate-systems-operations-support"),
    cosmo: { signals: [] } },
  { id: "dynamic-loads", name: "Injury from Dynamic Loads", group: "behavior", region: "bones",
    hazards: ["gravity"],
    what: "Landing forces and gravity changes can injure a crew whose bones and muscles have weakened.",
    signs: ["Pain after landing", "Disorientation"],
    countermeasures: ["Seat and restraint standards", "Improved suit design"],
    numbers: [], source: ref("risk-of-injury-from-dynamic-loads"),
    cosmo: { signals: ["symptoms"] } },
  { id: "cancer", name: "Radiation-Induced Cancers", group: "radiation", region: "whole-body",
    hazards: ["radiation"],
    what: "Higher radiation in space can lead to certain cancers and is linked to heart, blood vessel, eye and nervous system effects.",
    signs: [],
    countermeasures: ["Radiation-measuring instruments", "Shielding", "Medicines under study", "Health surveillance"],
    numbers: [], source: ref("risk-of-radiation-induced-cancers"),
    cosmo: { signals: ["radiationDose"] } },
];

export interface Study { name: string; where: "Artemis II" | "Low Earth Orbit" | "Past"; aim: string; relevance?: string }
export const RESEARCH_SOURCE = "https://www.nasa.gov/hrp/ongoing-hrp-research/";

export const studies: Study[] = [
  { name: "ARCHeR", where: "Artemis II", aim: "Tracks well-being, activity and sleep with a wrist-worn actigraphy device.", relevance: "Precedent for the Cosmo Band." },
  { name: "Immune Biomarkers", where: "Artemis II", aim: "Analyzes blood and saliva to see how deep space affects immunity." },
  { name: "Artemis II Standard Measures", where: "Artemis II", aim: "Collects a consistent set of health information for future researchers.", relevance: "Precedent for Cosmo's personal baseline." },
  { name: "B-Complex", where: "Low Earth Orbit", aim: "Tests whether a daily B vitamin lessens brain and eye changes." },
  { name: "Brain Fluid Pressure", where: "Low Earth Orbit", aim: "Relates pressure inside the skull to eye and brain changes." },
  { name: "CIPHER", where: "Low Earth Orbit", aim: "Studies how many body systems change together in orbit.", relevance: "Includes routine ultrasound assessment." },
  { name: "Simulating Manual Piloting", where: "Low Earth Orbit", aim: "Checks how gravity transitions affect piloting ability." },
  { name: "Spacecraft Occupant Protection", where: "Low Earth Orbit", aim: "Combines crew discomfort surveys with spacecraft sensor data during re-entry." },
  { name: "Spinal Fluid Biomarkers", where: "Low Earth Orbit", aim: "Looks for substances in spinal fluid linked to brain and eye changes." },
  { name: "Standard Measures", where: "Low Earth Orbit", aim: "Collects consistent physiological and psychological measurements." },
  { name: "Thigh Cuff", where: "Low Earth Orbit", aim: "Tests whether tight thigh cuffs keep fluid in the legs to protect the eyes." },
  { name: "Venous Haemostasis", where: "Low Earth Orbit", aim: "Examines blood flow and clotting changes." },
  { name: "Zero T2", where: "Low Earth Orbit", aim: "Examines exercising without a treadmill." },
  { name: "Tempus Pro", where: "Past", aim: "Tested a commercial telemedicine device that collects and integrates health data for near real-time diagnosis.", relevance: "Precedent for Cosmo as the integrating device." },
];

export const csa = {
  radiation: {
    source: "https://www.asc-csa.gc.ca/eng/news/articles/2026/2026-02-26-monitoring-radiation-astronaut-health.asp",
    points: [
      "The Canadian Active Neutron Spectrometer (CANS) is a compact instrument that measures neutron exposure continuously and on its own.",
      "Neutrons account for about 30% of total radiation on the ISS.",
      "It follows bubble detectors and earlier Canadian ISS experiments (MOSFET, EVARM, Radi-N, Radi-N2).",
    ],
  },
  science: {
    source: "https://www.asc-csa.gc.ca/eng/iss/science/why-do-we-conduct-science-experiments-in-space.asp",
    points: [
      "Moon and Mars trips mean more weightlessness, radiation and isolation, communication delays, and less emergency medical help from Earth.",
      "Weightlessness produces changes that resemble accelerated aging, so astronaut research also helps people on Earth.",
    ],
  },
};

/** Lookup helpers */
export const risksByRegion = (r: BodyRegion) => risks.filter((x) => x.region === r);
export const risksByHazard = (h: HazardId) => risks.filter((x) => x.hazards.includes(h));
