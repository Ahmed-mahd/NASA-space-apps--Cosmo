/**
 * Content for Cosmo's mental-health side: jokes, trivia and calm scripts.
 * Trivia answers come from the NASA and CSA pages already cited in nasa.ts.
 * NASA lists journaling, windows and views, and virtual contact as
 * countermeasures for behavioral risk; the Mind deck is built around those.
 */
import { csa, hazards, risks } from "./nasa";

export interface Joke { setup: string; punch: string }
export const JOKES: Joke[] = [
  { setup: "I told the crew a joke about gravity.", punch: "It didn't land." },
  { setup: "Why is it so easy to keep this station tidy?", punch: "Nothing ever ends up on the floor. Or anywhere, really." },
  { setup: "I tried the new restaurant on the Moon.", punch: "Great food. No atmosphere." },
  { setup: "How do astronauts organise a party?", punch: "They planet." },
  { setup: "What's an astronaut's favourite key on the keyboard?", punch: "The space bar." },
  { setup: "How does the solar system hold up its trousers?", punch: "With an asteroid belt." },
  { setup: "Your doctor on Earth said to watch your weight.", punch: "Up here we can't even find it." },
  { setup: "What did Mars say to Saturn?", punch: "Give me a ring sometime." },
  { setup: "Why did the Sun skip university?", punch: "It already had millions of degrees." },
  { setup: "Mission control says I'm the best AI on board.", punch: "I'm also the only AI on board. Still counts." },
  { setup: "What do you call a tick on the Moon?", punch: "A luna-tick." },
  { setup: "Why did Earth tease the other planets?", punch: "Because they had no life." },
  { setup: "Your bathroom scale back home has been very quiet lately.", punch: "It's technically unemployed." },
  { setup: "What's my favourite exercise on this ship?", punch: "Floating to conclusions." },
  { setup: "How do you get a baby astronaut to sleep?", punch: "You rocket." },
  { setup: "What do planets like to read?", punch: "Comet books." },
  { setup: "I asked the black hole how its day was going.", punch: "It said: don't get me started, I'm absorbing a lot right now." },
  { setup: "Why don't astronauts ever lose an argument up here?", punch: "Every point they make carries a lot of weight. Well, zero weight. Let me work on that one." },
];

export const LAUGH_REPLIES = [
  "Ha! I'll be here all mission. Literally.",
  "That laugh just raised your heart-rate variability. Science.",
  "Comedy: one of NASA's least-studied countermeasures.",
];
export const GROAN_REPLIES = [
  "Tough crowd. The vacuum outside laughed harder, and it can't hear.",
  "Fair. I'll recalibrate my humour module.",
  "Noted. That one goes in the airlock.",
];

const risk = (id: string) => risks.find((r) => r.id === id)!;
export interface Trivia { q: string; options: string[]; answer: number; fact: string; source: string; said: RegExp[] }
export const TRIVIA: Trivia[] = [
  { q: "How many sunrises and sunsets do crews on the International Space Station see in one day?", options: ["One", "Four", "Sixteen"], answer: 2,
    fact: "Sixteen. That's one reason sleep is so hard up here.", source: risk("sleep").source, said: [/one\b|1\b/i, /four|4/i, /six?teen|16/i] },
  { q: "On a long mission, how much bone density can astronauts lose each month?", options: ["About 0.1 percent", "1 to 1.5 percent", "10 percent"], answer: 1,
    fact: "About 1 to 1.5 percent a month, which is why you exercise every day.", source: risk("bone").source, said: [/0\.1|point one|tenth/i, /1\.5|one and a half|1 to|one to/i, /ten|10/i] },
  { q: "About how long do space station crews exercise each day?", options: ["15 minutes", "1.5 hours", "4 hours"], answer: 1,
    fact: "About an hour and a half, six or seven days a week.", source: risk("fitness").source, said: [/fifteen|15/i, /hour and a half|1\.5|90/i, /four|4/i] },
  { q: "Mars gravity is about how much of Earth's?", options: ["One tenth", "Three eighths", "The same"], answer: 1,
    fact: "About three eighths. You'd weigh less, but your bones would still notice.", source: hazards.find((h) => h.id === "gravity")!.source, said: [/tenth/i, /three eighth|3\/8|eighth/i, /same/i] },
  { q: "Neutrons make up about what share of the radiation on the space station?", options: ["3 percent", "30 percent", "90 percent"], answer: 1,
    fact: "About 30 percent, according to the Canadian Space Agency.", source: csa.radiation.source, said: [/\b3\b|three percent/i, /thirty|30/i, /ninety|90/i] },
  { q: "The longest spacewalk on record lasted about how long?", options: ["2 hours", "8 hours 56 minutes", "24 hours"], answer: 1,
    fact: "8 hours and 56 minutes. Bring snacks.", source: risk("eva").source, said: [/two|2 hour/i, /eight|8|56/i, /twenty.?four|24/i] },
  { q: "About what share of space station astronauts show some swelling at the back of the eye?", options: ["7 percent", "30 percent", "70 percent"], answer: 2,
    fact: "About 70 percent. That's why crews get regular eye imaging.", source: risk("sans").source, said: [/seven percent|\b7\b/i, /thirty|30/i, /seventy|70/i] },
  { q: "How many hours do astronauts spend in simulators before launch, on average?", options: ["30", "300", "3,000"], answer: 1,
    fact: "Around 300 hours.", source: risk("systems").source, said: [/^thirty$|\b30\b/i, /three hundred|300/i, /three thousand|3,?000/i] },
];

export const MOODS = [
  { id: "great", label: "Great", color: "#3dffb0", words: /great|amazing|awesome|fantastic|excellent|happy|good mood/i,
    reply: "Love that. I'm saving this one in your mission log." },
  { id: "okay", label: "Okay", color: "#2ee6ff", words: /okay|ok\b|fine|alright|not bad|good/i,
    reply: "Okay is a perfectly good orbit to be in. I'm here if that changes." },
  { id: "tired", label: "Tired", color: "#ffd84d", words: /tired|sleepy|exhausted|drained|worn/i,
    reply: "Tired makes sense after a short night. A rest block or a short breathing break could help." },
  { id: "low", label: "Low", color: "#ff9a3d", words: /sad|down|low|lonely|homesick|miss (home|my)/i,
    reply: "Thank you for telling me. Missing home is completely normal this far out. Want a minute at the Earth window with me?" },
  { id: "stressed", label: "Stressed", color: "#ff3b5c", words: /stress|anxious|nervous|worried|overwhelm|scared|tense/i,
    reply: "I hear you. Let's slow things down together. Two minutes of breathing?" },
] as const;
export type MoodId = (typeof MOODS)[number]["id"];

export const EARTH_LINES = [
  "Here's home, turning slowly. Take a long look.",
  "That blue edge is the atmosphere. Everyone you love is under that thin line.",
  "Breathe out slowly. Nothing needs you for the next minute. I'm watching the ship.",
];
