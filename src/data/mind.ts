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
  { setup: "Why did the astronaut break up with the Moon?", punch: "It needed space. And honestly, the Moon kept going through phases." },
  { setup: "What kind of music do planets listen to?", punch: "Nep-tunes." },
  { setup: "Why couldn't the astronaut book a room on the Moon?", punch: "It was full." },
  { setup: "What do you call a slightly unhinged spacewalker?", punch: "An astro-nut." },
  { setup: "What did the alien say to the garden?", punch: "Take me to your weeder." },
  { setup: "Why did the cow want to fly to space?", punch: "To see the moooon." },
  { setup: "What's a light-year?", punch: "Like a regular year, but with fewer calories." },
  { setup: "What did you see on the galley stove this morning?", punch: "An unidentified frying object." },
  { setup: "How does the man in the Moon cut his hair?", punch: "Eclipse it." },
  { setup: "What holds the Moon up?", punch: "Moon beams, obviously." },
  { setup: "What do you get if you cross a galaxy with a toad?", punch: "Star warts." },
  { setup: "Why don't aliens eat clowns?", punch: "Because they taste funny." },
  { setup: "The Sun came to me feeling burned out.", punch: "I prescribed some solar rest. No dose. I'm not allowed to name one." },
  { setup: "I asked mission control for more legroom.", punch: "They said: you're weightless, your legs can go anywhere they like." },
  { setup: "How do you get clean in space?", punch: "You take a meteor shower." },
  { setup: "Why did the satellite get promoted?", punch: "It was outstanding in its field. Its magnetic field." },
  { setup: "What did one asteroid say to the other?", punch: "Pleased to meteor." },
  { setup: "My workout advice up here is simple.", punch: "Lift everything. It's all weightless anyway. The treadmill harness disagrees." },
  { setup: "What's the first thing I check every morning?", punch: "Your heart rate. Then whether you laughed at yesterday's joke. Only one of them is reliable." },
  { setup: "Why did the star go back to school?", punch: "To get a little brighter." },
  { setup: "Why is the Moon never hungry?", punch: "Because it's always full. Well, once a month." },
  { setup: "What do you call a crewmate who floats past the coffee without stopping?", punch: "A missed opportunity. And possibly an alien." },
];

/* ---------------- talking about feelings ---------------- */
/**
 * Feelings Cosmo explores before suggesting anything. It asks what is behind the
 * feeling, then what usually helps, and only then offers a plan. Details stay
 * private: the mission log only records that a check-in happened.
 */
export type FeelingId = "lonely" | "homesick" | "sad" | "depressed" | "anxious" | "stressed" | "angry" | "bored" | "unmotivated";
export interface Feeling { id: FeelingId; words: RegExp; mood: MoodId; ask: string; /** Ask how long it has been going on. */ duration: boolean }
export const FEELINGS: Feeling[] = [
  { id: "depressed", mood: "low", duration: true, words: /depress|hopeless|empty inside|feel empty|numb|worthless|don'?t enjoy anything|nothing matters/i,
    ask: "Thank you for trusting me with that. Can you tell me a bit more? What's been going on?" },
  { id: "lonely", mood: "low", duration: true, words: /lonely|loneliness|isolated|no one to talk|nobody to talk|feel(ing)? (so )?alone|so alone/i,
    ask: "I'm sorry you're feeling lonely. That's a heavy one out here, and it's more common than people think. What's been making you feel that way?" },
  { id: "homesick", mood: "low", duration: false, words: /homesick|miss(ing)? (home|earth|my (family|wife|husband|partner|kids?|children|daughter|son|mom|mum|dad|parents|dog|cat|friends)|everyone)/i,
    ask: "Missing home is one of the hardest parts of being this far away. What are you missing most right now?" },
  { id: "sad", mood: "low", duration: true, words: /\bsad\b|feel(ing)? (really |a bit |pretty |kind of |so )?(down|low|blue)|unhappy|miserable|crying|\bcry\b|upset|heartbroken/i,
    ask: "Thank you for telling me. I'm listening. What's been weighing on you?" },
  { id: "anxious", mood: "stressed", duration: true, words: /anxious|anxiety|nervous|worried|worry|scared|afraid|panic|on edge/i,
    ask: "That sounds really uncomfortable. Let's take it one thing at a time. What's on your mind?" },
  { id: "stressed", mood: "stressed", duration: false, words: /stress|overwhelm|too much (work|to do|going on)|under pressure|swamped|burn(ed|t)? ?out|\btense\b/i,
    ask: "Sounds like a lot is landing on you at once. What's piling up?" },
  { id: "angry", mood: "stressed", duration: false, words: /angry|\bmad\b|annoyed|frustrat|irritat|furious|fed up/i,
    ask: "That sounds frustrating. Do you want to tell me what happened?" },
  { id: "bored", mood: "okay", duration: false, words: /bored|boring|monoton|same thing every day|nothing to do/i,
    ask: "Long missions get repetitive, even with a view like this. What's been feeling the most same-y?" },
  { id: "unmotivated", mood: "tired", duration: false, words: /unmotivated|no motivation|can'?t focus|can'?t concentrate|don'?t feel like doing/i,
    ask: "That happens to everyone on long missions. What's been draining your energy lately?" },
];

/** What is behind the feeling, and how Cosmo reflects it back. Order matters. */
export type TopicId = "family" | "crew" | "work" | "sleep" | "health" | "distance" | "news" | "unknown" | "other";
export const TOPICS: { id: TopicId; words: RegExp; reflect: string }[] = [
  { id: "unknown", words: /^(i )?(don'?t know|do not know|not sure|no idea|dunno|nothing( really)?|everything|it'?s everything|hard to say)\b/i,
    reflect: "That's okay. Sometimes it isn't one thing, it just builds up." },
  { id: "family", words: /family|wife|husband|partner|\bkids?\b|children|child|daughter|\bson\b|\bmom\b|\bmum\b|mother|\bdad\b|father|parents|brother|sister|baby|girlfriend|boyfriend|birthday|anniversary|wedding|graduation|my dog|my cat/i,
    reflect: "That's hard. Being this far from the people you love, especially on days that matter, hurts. It makes complete sense you feel this way." },
  { id: "crew", words: /crew|commander|colleague|\bteam\b|argu|fight|conflict|nobody listens|don'?t get along|left out/i,
    reflect: "Living this close to the same few people is tough, and friction is normal. What you feel about it is valid." },
  { id: "work", words: /work|task|\bjob\b|mission|spacewalk|\beva\b|experiment|schedule|deadline|mistake|workload|procedure|repair|timeline/i,
    reflect: "That's a lot to carry. Big tasks feel heavier when you're tired and far from home." },
  { id: "sleep", words: /sleep|insomnia|awake at night|can'?t rest|nightmare/i,
    reflect: "Poor sleep makes everything feel heavier. That part we can actually work on together." },
  { id: "health", words: /health|my body|pain|sick|scan|results|bones|eyes/i,
    reflect: "Worrying about your health out here makes sense. I'm watching your readings closely, and you can ask me about any of them." },
  { id: "distance", words: /earth|so far|distance|stuck|confined|cramped|small space|trapped|can'?t go outside|walls/i,
    reflect: "This much distance and this little space is hard on anyone. Feeling it doesn't mean you're doing anything wrong." },
  { id: "news", words: /news|the world|election|\bwar\b|disaster|something happened/i,
    reflect: "Hearing about things back home when you can't do anything about them is really hard." },
];
export const OTHER_REFLECT = "Thank you for telling me. That sounds hard.";
export const HELPS_Q = "When you've felt like this before, what usually helps you feel better?";
export const DURATION_Q = "Has this been building for a while, or is it mostly today?";

/** What the astronaut says helps, mapped to something Cosmo can offer. Order matters. */
export type PlanId = "family-call" | "psych-conference" | "crew-company" | "exercise" | "quiet" | "earth" | "journal" | "breathing" | "rest" | "joke" | "trivia" | "options";
export const HELPS: { plan: PlanId; words: RegExp }[] = [
  { plan: "options", words: /^(i )?(don'?t know|do not know|not sure|no idea|dunno|nothing( really)?|nothing helps)\b/i },
  { plan: "psych-conference", words: /psycholog|psychiatr|therap|counsel|professional|flight surgeon|doctor/i },
  { plan: "family-call", words: /family|wife|husband|partner|\bkids?\b|children|daughter|\bson\b|\bmom\b|\bmum\b|mother|\bdad\b|father|parents|brother|sister|girlfriend|boyfriend|call(ing)? home|hear(ing)? (their|her|his) voice|video call/i },
  { plan: "crew-company", words: /talk(ing)? (to|with) (someone|somebody|people|a friend|friends|the crew|crew|my crewmates?)|company|hang(ing)? out|not being alone|being around/i },
  { plan: "exercise", words: /exercis|work(ing)? ?out|\brun(ning)?\b|gym|treadmill|bike|cycl|yoga|stretch|moving|sport/i },
  { plan: "quiet", words: /music|songs?|playlist|\bsing|read(ing)?|books?|photos?|pictures|letters|movies?|films?|\bshows?\b|series|cook|paint|draw/i },
  { plan: "earth", words: /window|earth|look(ing)? (out|at)|view|nature|outside|stars|\bsky\b|garden|plants?|vegetables?|\bgrow/i },
  { plan: "journal", words: /writ(e|ing)|journal|diary/i },
  { plan: "breathing", words: /breath|meditat|calm|quiet|mindful|pray/i },
  { plan: "rest", words: /sleep|rest|\bnap\b|lie down|lying down|time alone|alone time|be alone|space to myself|privacy/i },
  { plan: "joke", words: /laugh|jokes?|funny|comedy|humou?r|silly/i },
  { plan: "trivia", words: /games?|puzzles?|quiz|trivia|challenge/i },
];

/** Thoughts of self-harm: Cosmo stops everything, stays, and gets a person on the line. */
export const CRISIS = /kill myself|suicid|end (it all|my life)|want to die|wanna die|don'?t want to (live|be alive|be here anymore|wake up)|hurt(ing)? myself|harm(ing)? myself|no (reason|point) (to|in) (live|living|going on)|better off without me|can'?t go on|take my (own )?life/i;

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
    reply: "Thank you for telling me. What has been making you feel this way?" },
  { id: "stressed", label: "Stressed", color: "#ff3b5c", words: /stress|anxious|nervous|worried|overwhelm|scared|tense/i,
    reply: "I hear you. Let's slow things down together. Two minutes of breathing?" },
] as const;
export type MoodId = (typeof MOODS)[number]["id"];

export const EARTH_LINES = [
  "Here's home, turning slowly. Take a long look.",
  "That blue edge is the atmosphere. Everyone you love is under that thin line.",
  "Breathe out slowly. Nothing needs you for the next minute. I'm watching the ship.",
];
