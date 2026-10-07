/**
 * The client half of NAIJA 2099's branching missions: where each step happens, who is there, and
 * which choices they offer. The server (StoryService) decides whether a choice is allowed and what
 * it costs, pays or changes -- this only knows where to send you and what to show.
 */
import { toXZ, type LatLon } from './geo';

export type Choice = { move: string; label: string; detail?: string };
export type Beat = {
  /** where you have to be (and how close, metres) */
  at: LatLon | { landmark: string }; radius: number;
  /** what the mission card says while you travel */
  objective: string; place: string;
  /** who speaks when you arrive, what they say, and what you can choose */
  who: string; line: string; choices: Choice[];
  /** this step's move is made by arriving (with a vehicle, if [vehicle]) rather than by choosing */
  arriveMove?: string; vehicle?: boolean;
};

export type MissionDef = { id: string; title: string; brief: string; faction: string; beats: Record<string, Beat> };

const BALOGUN = { landmark: 'balogun' } as const;

export const TOMATO: MissionDef = {
  id: 'tomato',
  title: 'Tomato Emergency',
  brief: 'A tomato truck from the north has broken down. Balogun needs 40 baskets before the Eid rush.',
  faction: "Market Women's Guild",
  beats: {
    // not started: Iya Rofiat at Balogun asks for help
    '': {
      at: BALOGUN, radius: 30, objective: 'Meet Iya Rofiat at', place: 'Balogun Market',
      who: 'Iya Rofiat, tomato wholesaler',
      line: '"My child, wahala dey o. The tomato truck from Kano don break down for Ogere. Eid na Friday -- if Balogun no get tomato, prices go fly and people go suffer. Forty baskets. You fit help me?"',
      choices: [{ move: 'accept', label: 'I go help you, Iya', detail: 'Start the Tomato Emergency' }],
    },
    route: {
      at: BALOGUN, radius: 40, objective: 'Decide how to get the tomatoes —', place: 'talk to Iya Rofiat',
      who: 'Iya Rofiat',
      line: '"Three ways. Mile 12 market get plenty, but those northern traders sabi price. The union for Obalende fit send danfos -- if you settle them. Or those Yaba children with their flying machines... e go cost you."',
      choices: [
        { move: 'route:mile12', label: 'Drive to Mile 12 and haggle', detail: 'Cheapest if you bargain — a long drive' },
        { move: 'route:union', label: 'Ask the union at Obalende', detail: '₦3,000 levy, or a favour if they know you' },
        { move: 'route:drone', label: 'Hire a Yaba drone courier', detail: '₦12,000 — fast' },
      ],
    },
    mile12: {
      at: [6.6060, 3.3990], radius: 40, objective: 'Buy 40 baskets at', place: 'Mile 12 Market',
      who: 'Alhaji Musa, tomato trader',
      line: '"Salaam. Forty baskets? Tomato don scarce since the truck wahala. Normal price na ₦18,000 for everything. You wan pay or you wan talk?"',
      choices: [
        { move: 'haggle:fair', label: 'Pay the fair price', detail: '₦18,000 — the traders will remember you kindly' },
        { move: 'haggle:hard', label: 'Haggle him down hard', detail: '₦12,000 — Mile 12 will remember that too' },
      ],
    },
    union: {
      at: { landmark: 'obalende' }, radius: 50, objective: 'See the union chairman at', place: 'Obalende Motor Park',
      who: 'Chairman Bello, NURTW',
      line: '"Tomatoes for Balogun? My danfos fit carry am. Levy na ₦3,000 -- unless say you be our person already."',
      choices: [
        { move: 'union:pay', label: 'Pay the levy', detail: '₦3,000 — the union warms to you' },
        { move: 'union:favour', label: 'Call in a favour', detail: 'Free, if the union already likes you — and you will owe them' },
      ],
    },
    drone: {
      at: [6.5095, 3.3785], radius: 45, objective: 'Book the drone courier in', place: 'Yaba',
      who: 'Kemi, drone courier',
      line: '"Forty baskets, Balogun, today? Our heavy-lift drones fit do am in one run. ₦12,000, cash before take-off."',
      choices: [{ move: 'drone:pay', label: 'Pay and launch', detail: '₦12,000 — the Yaba Collective likes paying customers' }],
    },
    haul: {
      at: BALOGUN, radius: 40, objective: 'Drive the tomatoes to', place: 'Balogun Market', vehicle: true, arriveMove: 'arrive',
      who: '', line: '', choices: [],
    },
    convoy: {
      at: BALOGUN, radius: 40, objective: 'Meet the union danfos at', place: 'Balogun Market', arriveMove: 'arrive',
      who: '', line: '', choices: [],
    },
    airborne: {
      at: BALOGUN, radius: 40, objective: 'Meet the drones at', place: 'Balogun Market', arriveMove: 'arrive',
      who: '', line: '', choices: [],
    },
    sell: {
      at: BALOGUN, radius: 45, objective: 'Decide the price with', place: 'Iya Rofiat',
      who: 'Iya Rofiat',
      line: '"Forty baskets! The whole market dey watch us. Tell me -- we go sell am at normal price, or we go wait make price climb small?"',
      choices: [
        { move: 'sell:fair', label: 'Sell at the normal price', detail: 'Everyone eats this Eid — Balogun will not forget' },
        { move: 'sell:hold', label: 'Hold it back and sell high', detail: 'Much more money — the market will not forget either' },
      ],
    },
  },
};

const OJUELEGBA = { landmark: 'ojuelegba' } as const;
const MAKOKO: LatLon = [6.4960, 3.3895];
const SURULERE_HOME: LatLon = [6.4985, 3.3535];

export const GRIDLOCK: MissionDef = {
  id: 'gridlock', title: 'Ojuelegba Gridlock', brief: 'A broken traffic light has jammed the busiest junction in Lagos.', faction: 'WYRD',
  beats: {
    '': { at: OJUELEGBA, radius: 60, objective: 'Meet Officer Ngozi at', place: 'Ojuelegba junction', who: 'Officer Ngozi, LASTMA',
      line: '"See this go-slow! The light don die since morning and the whole Surulere dey stand still. You get any idea?"',
      choices: [{ move: 'accept', label: 'Let me see what I can do', detail: 'Start Ojuelegba Gridlock' }] },
    fix: { at: OJUELEGBA, radius: 70, objective: 'Get the junction moving at', place: 'Ojuelegba', who: 'Officer Ngozi',
      line: '"Three ways I know: report am to WYRD and wait, fiddle the light yourself, or pay those area boys to direct traffic. Choose quick o."',
      choices: [
        { move: 'fix:wyrd', label: 'Report it to WYRD', detail: 'The proper way — the city mind will remember' },
        { move: 'fix:hack', label: 'Hack the light yourself', detail: 'Fast — the Yaba crowd will love it, the police will not' },
        { move: 'fix:area', label: 'Pay the area boys ₦2,000', detail: 'They direct traffic — and expect it again tomorrow' },
      ] },
  },
};

export const SCHOOL: MissionDef = {
  id: 'school', title: 'The Floating School Run', brief: 'WAEC papers must reach the floating school in Makoko before the exam.', faction: 'Waterfront Alliance',
  beats: {
    '': { at: MAKOKO, radius: 60, objective: 'Meet Mr Ayọ̀ at', place: 'Makoko floating school', who: 'Mr Ayọ̀, teacher',
      line: '"My children don read for this WAEC since January. The papers dey UNILAG -- if they no reach here before eight tomorrow, all that work go waste."',
      choices: [{ move: 'accept', label: 'I go bring them', detail: 'Start The Floating School Run' }] },
    papers: { at: { landmark: 'unilag-gate' }, radius: 60, objective: 'Collect the exam papers at', place: 'UNILAG', arriveMove: 'collect', who: '', line: '', choices: [] },
    boat: { at: { landmark: 'unilag-gate' }, radius: 70, objective: 'Get a boat for the papers at', place: 'UNILAG', who: 'Exam officer',
      line: '"Papers sealed. Road to Makoko full of go-slow -- water is faster. Who carry you?"',
      choices: [
        { move: 'boat:canoe', label: 'Ride with the fishermen', detail: 'Slow and sure — the Waterfront Alliance notices' },
        { move: 'boat:smugglers', label: "Borrow the smugglers' speedboat", detail: 'Fast — but you will owe them, and the police may hear' },
        { move: 'boat:wyrd', label: 'Ask WYRD to hold the ferry', detail: 'The city mind likes education' },
      ] },
    deliver: { at: MAKOKO, radius: 60, objective: 'Deliver the papers to', place: 'Makoko floating school', arriveMove: 'arrive', who: '', line: '', choices: [] },
  },
};

export const MASTERS: MissionDef = {
  id: 'masters', title: 'Lost Masters', brief: "A highlife legend's master tapes are up for auction abroad.", faction: 'Orisa Data Keepers',
  beats: {
    '': { at: SURULERE_HOME, radius: 60, objective: 'Visit Baba Tunde in', place: 'Surulere', who: 'Baba Tunde',
      line: '"My father play highlife for forty years. Now some collector abroad dey auction his master tapes. Our history -- for sale like tomato."',
      choices: [{ move: 'accept', label: 'We go bring them home', detail: 'Start Lost Masters' }] },
    how: { at: SURULERE_HOME, radius: 70, objective: 'Decide how to save the tapes —', place: 'talk to Baba Tunde', who: 'Baba Tunde',
      line: '"We fit raise money, we fit prove say they be ours, or... somebody fit talk to that man\'s heart."',
      choices: [
        { move: 'how:crowd', label: 'Crowdfund the bid (₦5,000 to start)', detail: 'Lagos gives — and the whole internet watches' },
        { move: 'how:archive', label: 'Prove ownership in the archives', detail: 'Off to the National Museum, Onikan' },
        { move: 'how:conscience', label: "Appeal to the seller's conscience", detail: 'A phone call, and a long silence' },
      ] },
    museum: { at: [6.4446, 3.4039], radius: 60, objective: 'Search the old recordings at', place: 'National Museum, Onikan', arriveMove: 'proof', who: '', line: '', choices: [] },
  },
};

export const WATER: MissionDef = {
  id: 'water', title: "The Prophet's Miracle Water", brief: 'Children in Mushin are falling sick after drinking "blessed" water.', faction: 'Faith Coalition',
  beats: {
    '': { at: [6.5273, 3.3449], radius: 60, objective: 'Meet Sister Grace in', place: 'Mushin', who: 'Sister Grace',
      line: '"I no wan talk against man of God... but since Prophet start to sell that blessed water, children dey fall sick. Something no right."',
      choices: [{ move: 'accept', label: 'Let me find out', detail: "Start The Prophet's Miracle Water" }] },
    test: { at: [6.5296, 3.3496], radius: 50, objective: 'Get the water tested at', place: 'the Mushin clinic (₦1,500)', arriveMove: 'test', who: '', line: '', choices: [] },
    choose: { at: [6.5296, 3.3496], radius: 60, objective: 'Decide what to do with the truth —', place: 'at the clinic', who: 'Dr Bello, clinic',
      line: '"Contaminated well water, bottled and blessed. It must stop. How you wan do am?"',
      choices: [
        { move: 'tell:faith', label: 'Tell the Faith Coalition', detail: 'Quiet, respectful, effective' },
        { move: 'tell:online', label: 'Expose him online', detail: 'Loud — and some will blame you' },
        { move: 'tell:private', label: 'Confront him privately', detail: 'Make him refund everyone, and tell no one' },
      ] },
  },
};

export const GENERATOR: MissionDef = {
  id: 'generator', title: 'Generator Wars', brief: 'Two neighbours are at war over a shared generator.', faction: 'Lagos State Government',
  beats: {
    '': { at: [6.4955, 3.3600], radius: 50, objective: 'Settle a fight in', place: 'a Surulere street', who: 'Mrs Lawal',
      line: '"Every night na fight! Mr Okafor say na him turn, I say na my turn -- and the fuel no even reach. Abeg, help us before somebody go police."',
      choices: [{ move: 'accept', label: 'Make we settle am', detail: 'Start Generator Wars' }] },
    fix: { at: [6.4955, 3.3600], radius: 60, objective: 'Bring peace to', place: 'the street', who: 'Mr Okafor and Mrs Lawal',
      line: '"Okay. We dey hear you. Wetin you suggest?"',
      choices: [
        { move: 'fix:schedule', label: 'Write a fair rota', detail: 'Fuel shared by the hour' },
        { move: 'fix:solar', label: 'Start a solar co-op (₦8,000)', detail: 'Panels on three roofs — the end of the generator' },
        { move: 'fix:grid', label: 'Push to get the grid fixed', detail: 'File it with WYRD and chase the crew' },
      ] },
  },
};

export const MISSIONS = [TOMATO, GRIDLOCK, SCHOOL, MASTERS, WATER, GENERATOR];

/** where a beat happens, in world metres (landmarks from their snapped positions) */
export function beatPoint(b: Beat, marks: { id: string; x: number; z: number }[]) {
  if ('landmark' in b.at) { const lm = b.at.landmark; const m = marks.find((q) => q.id === lm); return m ? { x: m.x, z: m.z + 20 } : null; }
  return toXZ(b.at);
}
