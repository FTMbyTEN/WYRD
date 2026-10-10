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

export const OWAMBE: MissionDef = {
  id: "owambe", title: "Owambe Under the Rain", brief: "A wedding canopy collapses on Victoria Island minutes before the couple's entrance.", faction: "Market Women's Guild",
  beats: {
    '': { at: [6.43,3.4205], radius: 60, objective: 'Meet Mama Tolu at', place: "the wedding on Victoria Island", who: "Mama Tolu, mother of the bride",
      line: "\"Rain don scatter everything! The canopy fall, the gele dey soak, and the couple go enter in ten minutes. Who go save this owambe?\"",
      choices: [{ move: 'accept', label: "I go handle am", detail: "Start Owambe Under the Rain" }] },
    decide: { at: [6.43,3.4205], radius: 70, objective: 'Decide what to do at', place: "the wedding on Victoria Island", who: "Mama Tolu and Mama Ebuka",
      line: "\"Three ways: beg Mrs Dosunmu (our rival planner) for her canopies, move everybody inside the hall, or... make the DJ turn the rain into the party.\"",
      choices: [
        { move: "fix:rival", label: "Borrow the rival planner's canopies", detail: "She will remember the favour — one way or another" },
        { move: "fix:indoors", label: "Move the party into the hall", detail: "Cramped, but dry" },
        { move: "fix:rain", label: "Tell the DJ: rain dance!", detail: "Bold. The internet will see it" },
      ] },
  },
};

export const SEAWALL: MissionDef = {
  id: "seawall", title: "Sea Wall Crack", brief: "A crack in the Great Wall of Lagos threatens a storm-surge breach.", faction: "Atlantic Rise Consortium",
  beats: {
    '': { at: { landmark: "eko-atlantic" }, radius: 60, objective: 'Meet Engr. Hauwa at', place: "the Eko Atlantic sea wall", who: "Engr. Hauwa, sea-wall engineer",
      line: "\"See this crack. Two metres, and growing with every tide. If the next storm finds it, the water goes somewhere — and it will not be Eko Atlantic that pays.\"",
      choices: [{ move: 'accept', label: "Show me", detail: "Start Sea Wall Crack" }] },
    decide: { at: { landmark: "eko-atlantic" }, radius: 70, objective: 'Decide what to do at', place: "the Eko Atlantic sea wall", who: "Engr. Hauwa",
      line: "\"So. Do we tell Atlantic Rise, tell the press, or call the Waterfront divers and fix it tonight ourselves?\"",
      choices: [
        { move: "fix:atlantic", label: "Alert Atlantic Rise", detail: "The proper channel — they take the credit" },
        { move: "fix:press", label: "Leak it to journalists", detail: "Everyone will know how close it came" },
        { move: "fix:divers", label: "Call the Waterfront divers", detail: "Makoko fixes the rich man's wall" },
      ] },
    "go_divers": { at: [6.496,3.3895], radius: 60, objective: "Bring the divers from", place: "Makoko", arriveMove: "divers", who: '', line: '', choices: [] },
  },
};

export const UNION: MissionDef = {
  id: "union", title: "Union Election", brief: "Obalende motor park chooses a new chairman.", faction: "NURTW 2099 (transport unions)",
  beats: {
    '': { at: { landmark: "obalende" }, radius: 60, objective: 'Meet Mama Kemi at', place: "Obalende motor park", who: "Mama Kemi, reform candidate",
      line: "\"Alhaji Bello has run this park for twenty years. Levies go up, buses get older, and the money goes... somewhere. Tomorrow we vote. Will you help?\"",
      choices: [{ move: 'accept', label: "I'm listening", detail: "Start Union Election" }] },
    decide: { at: { landmark: "obalende" }, radius: 70, objective: 'Decide what to do at', place: "Obalende motor park", who: "Mama Kemi",
      line: "\"Campaign with me, make peace with Alhaji, or show the drivers what he pays for votes. Your call.\"",
      choices: [
        { move: "vote:campaign", label: "Campaign for Mama Kemi", detail: "Lower levies if she wins — and an angry Alhaji" },
        { move: "vote:deal", label: "Broker a deal between them", detail: "Alhaji stays chairman; Mama Kemi runs the money" },
        { move: "vote:expose", label: "Expose the vote-buying", detail: "Film the envelopes" },
      ] },
  },
};

export const PHONE: MissionDef = {
  id: "phone", title: "Phone of the Minister", brief: "A minister's lost phone holds evidence of a land deal.", faction: "Lagos State Government",
  beats: {
    '': { at: { landmark: "alausa" }, radius: 60, objective: 'Meet Musa at', place: "Alausa, Ikeja", who: "Musa, the minister's driver",
      line: "\"Oga left this phone in the car. I looked — I shouldn't have. Messages about Makoko land, and a lot of zeros. I can't keep it. You take it.\"",
      choices: [{ move: 'accept', label: "Give it to me", detail: "Start Phone of the Minister" }] },
    decide: { at: { landmark: "alausa" }, radius: 70, objective: 'Decide what to do at', place: "Alausa, Ikeja", who: "You, holding the phone",
      line: "The messages are clear: the waterfront sold before the people were told. Who gets this phone?",
      choices: [
        { move: "phone:return", label: "Return it to the minister", detail: "A reward, and a powerful friend" },
        { move: "phone:leak", label: "Leak the messages", detail: "Makoko fights back — the State remembers" },
        { move: "phone:sell", label: "Trade it to Atlantic Rise", detail: "They will pay — and use it" },
      ] },
  },
};

export const EYO: MissionDef = {
  id: "eyo", title: "The Eyo Procession", brief: "Keep the Eyo route on Lagos Island clear and safe.", faction: "Orisa Data Keepers",
  beats: {
    '': { at: { landmark: "tinubu-square" }, radius: 60, objective: 'Meet The Ìdẹ̀jọ chief\'s aide at', place: "Tinubu Square", who: "The Ìdẹ̀jọ chief's aide",
      line: "\"The Eyo come out at dawn. White from head to toe, and the route must be clear: no sandals, no okadas, no disrespect. The crowds this year are double.\"",
      choices: [{ move: 'accept', label: "How can I help?", detail: "Start The Eyo Procession" }] },
    decide: { at: { landmark: "tinubu-square" }, radius: 70, objective: 'Decide what to do at', place: "Tinubu Square", who: "The Ìdẹ̀jọ chief's aide",
      line: "\"The palace guards know the rites. WYRD knows the traffic. The youth know the streets. Who do we trust?\"",
      choices: [
        { move: "eyo:palace", label: "Work with the palace guards", detail: "Tradition, properly kept" },
        { move: "eyo:wyrd", label: "Let WYRD divert the traffic", detail: "Efficient — some elders frown at the machine" },
        { move: "eyo:youth", label: "Mobilise the local youth", detail: "Lagos Island looks after itself" },
      ] },
  },
};

export const CONTAINER: MissionDef = {
  id: "container", title: "Container 4B", brief: "A container at Apapa holds medical supplies stolen from a hospital.", faction: "Ports Syndicate",
  beats: {
    '': { at: [6.447,3.364], radius: 60, objective: 'Meet Dr Bello at', place: "Apapa port", who: "Dr Bello",
      line: "\"I tracked our missing drugs to this port. Container 4B. Insulin, antibiotics — enough for a year. And customs says they have 'no record' of it.\"",
      choices: [{ move: 'accept', label: "Let's open 4B", detail: "Start Container 4B" }] },
    decide: { at: [6.447,3.364], radius: 70, objective: 'Decide what to do at', place: "Apapa port", who: "You, at Container 4B",
      line: "The seals are fresh. The labels still say LAGOS GENERAL. The thieves will be back tonight.",
      choices: [
        { move: "cargo:return", label: "Get it back to the hospital", detail: "Quietly — the syndicate will notice" },
        { move: "cargo:whistle", label: "Blow the whistle on customs", detail: "Arrests — and enemies" },
        { move: "cargo:sell", label: "Sell it back to the thieves", detail: "Easy money. Sick people wait" },
      ] },
  },
};

export const STARTUP: MissionDef = {
  id: "startup", title: "Startup Buyout", brief: "A foreign giant wants to buy Makoko's water-taxi app from your friend.", faction: "Yaba Collective",
  beats: {
    '': { at: { landmark: "yaba-market" }, radius: 60, objective: 'Meet Chidinma at', place: "Yaba", who: "Chidinma, founder of FloatRide",
      line: "\"They've offered two million dollars for FloatRide. My water taxis, my code, my Makoko drivers. Two million. And they'll own the data on everyone who rides.\"",
      choices: [{ move: 'accept', label: "Talk me through it", detail: "Start Startup Buyout" }] },
    decide: { at: { landmark: "yaba-market" }, radius: 70, objective: 'Decide what to do at', place: "Yaba", who: "Chidinma",
      line: "\"Refuse and find Lagos money, sign with protections, or take it and share it out. Help me think.\"",
      choices: [
        { move: "buy:refuse", label: "Refuse — find local investors", detail: "Lagos keeps its own" },
        { move: "buy:protect", label: "Sign, with protections", detail: "Drivers keep their jobs, data stays here" },
        { move: "buy:sell", label: "Take the money and share it", detail: "Rich friends, nervous drivers" },
      ] },
  },
};

export const GOAT: MissionDef = {
  id: "goat", title: "The Kidnapped Goat", brief: "Malam Sani's prize Sallah ram has been stolen in Festac.", faction: "Market Women's Guild",
  beats: {
    '': { at: [6.466,3.284], radius: 60, objective: 'Meet Malam Sani and his grandson Abba at', place: "Festac Town", who: "Malam Sani and his grandson Abba",
      line: "\"Babangida is gone! The finest ram in Festac — three years I feed him — and Sallah is on Friday! Abba has not stopped crying. Neither have I.\"",
      choices: [{ move: 'accept', label: "We'll find Babangida", detail: "Start The Kidnapped Goat" }] },
    decide: { at: [6.466,3.284], radius: 70, objective: 'Decide what to do at', place: "Festac Town", who: "Malam Sani",
      line: "\"Ask the market women — they hear everything. Or pay the thieves. Or the vigilantes say they have a plan...\"",
      choices: [
        { move: "goat:gossip", label: "Follow the market gossip", detail: "Three aunties, one rumour, one ram" },
        { move: "goat:trade", label: "Trade for the ram (₦4,000)", detail: "Quick. The thieves learn it pays" },
        { move: "goat:trap", label: "Set a trap with the vigilantes", detail: "Bread, a red cloth, and patience" },
      ] },
  },
};

export const FLOOD: MissionDef = {
  id: "flood", title: "Flood Night", brief: "A flash flood traps commuters on the Lekki expressway.", faction: "Waterfront Alliance",
  beats: {
    '': { at: { landmark: "lekki-toll" }, radius: 60, objective: 'Meet Tunde at', place: "the Lekki toll gate", who: "Tunde, okada rider",
      line: "\"The water dey rise! Buses dey stuck from Lekki to Ajah, people dey on top of their cars. Do something, abeg!\"",
      choices: [{ move: 'accept', label: "Let's move", detail: "Start Flood Night" }] },
    decide: { at: { landmark: "lekki-toll" }, radius: 70, objective: 'Decide what to do at', place: "the Lekki toll gate", who: "Tunde",
      line: "\"Boats from the waterfront. Or WYRD can open the flood gates — but the water go go Makoko side. Or we clear the drains with our hands.\"",
      choices: [
        { move: "flood:boats", label: "Run boats to the expressway", detail: "Slow, every life counts" },
        { move: "flood:gates", label: "Ask WYRD to open the gates", detail: "Lekki drains — Makoko floods" },
        { move: "flood:drains", label: "Clear the drains with volunteers", detail: "Hard work, no one blamed" },
      ] },
  },
};

export const LEAK: MissionDef = {
  id: "leak", title: "The Leak", brief: "A guard hands you proof that Ikoyi estates profile their visitors.", faction: "Youth Assembly",
  beats: {
    '': { at: { landmark: "falomo" }, radius: 60, objective: 'Meet Mustapha at', place: "Falomo, Ikoyi", who: "Mustapha, a nervous gate-guard",
      line: "\"These are SENTINEL logs. Every visitor to the estates — face, phone, tribe, 'risk score'. They told us it was for security. It is not for security.\"",
      choices: [{ move: 'accept', label: "Give me the logs", detail: "Start The Leak" }] },
    decide: { at: { landmark: "falomo" }, radius: 70, objective: 'Decide what to do at', place: "Falomo, Ikoyi", who: "You, with the logs",
      line: "Thousands of names. Yours is in there too: \"risk: MEDIUM\".",
      choices: [
        { move: "leak:publish", label: "Publish everything", detail: "Protect Mustapha's name" },
        { move: "leak:wyrd", label: "Take it to WYRD", detail: "Let the city mind judge" },
        { move: "leak:blackmail", label: "Use it on the estates", detail: "Questionable — very profitable" },
      ] },
  },
};

export const PEPPERSOUP: MissionDef = {
  id: "peppersoup", title: "Pepper Soup Diplomacy", brief: "Two Mushin recycling crews are about to fight over territory.", faction: "Faith Coalition",
  beats: {
    '': { at: [6.531,3.348], radius: 60, objective: 'Meet Mama Ireti at', place: "Mama Ireti's buka, Mushin", who: "Mama Ireti, buka owner",
      line: "\"Those two crews — Baba Ade's and the Ojo boys — they go fight tonight over who collects the plastic on Ladipo. Somebody go die over bottles. Over BOTTLES.\"",
      choices: [{ move: 'accept', label: "Not on my watch", detail: "Start Pepper Soup Diplomacy" }] },
    decide: { at: [6.531,3.348], radius: 70, objective: 'Decide what to do at', place: "Mama Ireti's buka, Mushin", who: "Mama Ireti",
      line: "\"I can cook. You can talk. Or you find out who is really dumping on the other's side. Or just draw them a line.\"",
      choices: [
        { move: "soup:meal", label: "Host a peace meal at the buka", detail: "Pepper soup, honesty, a lot of shouting" },
        { move: "soup:prove", label: "Prove who is dumping", detail: "Cameras on the canal" },
        { move: "soup:split", label: "Split the territory", detail: "Peace by map" },
      ] },
  },
};

export const GHOSTBUS: MissionDef = {
  id: "ghostbus", title: "Ghost Bus", brief: "Passengers report a driverless danfo on Third Mainland Bridge at night.", faction: "Lagos State Government",
  beats: {
    '': { at: [6.487,3.388], radius: 60, objective: 'Meet Sule at', place: "the Third Mainland Bridge, Ebute-Metta end", who: "Sule, night conductor",
      line: "\"I swear to God — a yellow danfo, no driver, no conductor, doors open, going and coming on the bridge at 2am. People dey enter am!\"",
      choices: [{ move: 'accept', label: "Let's see this ghost", detail: "Start Ghost Bus" }] },
    decide: { at: [6.487,3.388], radius: 70, objective: 'Decide what to do at', place: "the Third Mainland Bridge, Ebute-Metta end", who: "You, watching the ghost bus",
      line: "An autonomous AREA bus, its badge scratched off, running a route that does not exist — and charging fares to an account in nobody's name.",
      choices: [
        { move: "ghost:investigate", label: "Follow the money", detail: "Who owns the account?" },
        { move: "ghost:hack", label: "Hack the bus back", detail: "Make it a free night bus" },
        { move: "ghost:wyrd", label: "Report it to WYRD", detail: "The city mind cleans up" },
      ] },
  },
};

export const GRANDMA: MissionDef = {
  id: "grandma", title: "Grandma's Land", brief: "Your family's land title in Ebute-Metta is being contested.", faction: "Orisa Data Keepers",
  beats: {
    '': { at: [6.485,3.378], radius: 60, objective: 'Meet Grandma Adunni at', place: "Ebute-Metta", who: "Grandma Adunni",
      line: "\"My father built this house in 1961. Now a family from Abeokuta says the land is theirs, with paper. Paper! I have the walls.\"",
      choices: [{ move: 'accept', label: "We won't lose it, Mama", detail: "Start Grandma's Land" }] },
    decide: { at: [6.485,3.378], radius: 70, objective: 'Decide what to do at', place: "Ebute-Metta", who: "Grandma Adunni",
      line: "\"The ORÍKÌ archive remembers everything. The court remembers whoever pays. Or we sit with that family like human beings.\"",
      choices: [
        { move: "land:archive", label: "Search the ORÍKÌ archive", detail: "At the National Museum, Onikan" },
        { move: "land:court", label: "Go to court (₦6,000)", detail: "Slow, expensive, binding" },
        { move: "land:talk", label: "Meet the claimant family", detail: "Two grandmothers, one table" },
      ] },
    "go_records": { at: [6.4446,3.4039], radius: 60, objective: "Search the records at", place: "the National Museum, Onikan", arriveMove: "records", who: '', line: '', choices: [] },
  },
};

export const MATCHDAY: MissionDef = {
  id: "matchday", title: "Match Day", brief: "A disputed penalty at the National Stadium — and a crowd about to riot.", faction: "Youth Assembly",
  beats: {
    '': { at: { landmark: "stadium" }, radius: 60, objective: 'Meet Coach Emeka at', place: "the National Stadium, Surulere", who: "Coach Emeka",
      line: "\"Penalty in the 94th minute — and the referee no even look the screen! Forty thousand fans, one gate. This thing fit scatter in five minutes.\"",
      choices: [{ move: 'accept', label: "Let me help", detail: "Start Match Day" }] },
    decide: { at: { landmark: "stadium" }, radius: 70, objective: 'Decide what to do at', place: "the National Stadium, Surulere", who: "Coach Emeka",
      line: "\"Get the VAR footage out. Or bring Captain Okon — the fans worship him. Or let WYRD slow the crowd at the gates.\"",
      choices: [
        { move: "match:var", label: "Get the VAR footage released", detail: "The truth, on the big screen" },
        { move: "match:legend", label: "Bring in Captain Okon", detail: "The ex-captain the fans love" },
        { move: "match:wyrd", label: "Let WYRD slow the crowd", detail: "Trains and gates, gently" },
      ] },
  },
};

export const JAPA: MissionDef = {
  id: "japa", title: "Japa or Stay", brief: "Your sibling has a visa interview, and the family needs money.", faction: "Lagos State Government",
  beats: {
    '': { at: { landmark: "airport" }, radius: 60, objective: 'Meet Your sibling at', place: "the airport", who: "Your sibling, Tobi",
      line: "\"The interview is Monday. Canada. I need ₦8,000 for the last fees, and Mummy is already crying. Tell me honestly — should I go?\"",
      choices: [{ move: 'accept', label: "Let's talk", detail: "Start Japa or Stay" }] },
    decide: { at: { landmark: "airport" }, radius: 70, objective: 'Decide what to do at', place: "the airport", who: "Tobi",
      line: "\"Fund me, find me a reason to stay, or help me find a way that isn't just leaving?\"",
      choices: [
        { move: "japa:fund", label: "Fund the visa (₦8,000)", detail: "A sibling abroad — a contact for life" },
        { move: "japa:job", label: "Find Tobi a job in Lagos", detail: "The Yaba Collective is hiring" },
        { move: "japa:scholarship", label: "Find a scholarship", detail: "Leave to learn, and come back" },
      ] },
  },
};

export const DRONESTRIKE: MissionDef = {
  id: "dronestrike", title: "The Drone Strike", brief: "Ikeja's delivery-drone pilots strike over pay.", faction: "Yaba Collective",
  beats: {
    '': { at: { landmark: "computer-village" }, radius: 60, objective: 'Meet Ifeoma at', place: "the Ikeja drone port", who: "Ifeoma, pilots' union rep",
      line: "\"Twelve hours a day flying their drones, and they cut our pay again. Today, nothing flies. Not food, not medicine — nothing — until they listen.\"",
      choices: [{ move: 'accept', label: "I'll hear both sides", detail: "Start The Drone Strike" }] },
    decide: { at: { landmark: "computer-village" }, radius: 70, objective: 'Decide what to do at', place: "the Ikeja drone port", who: "Ifeoma",
      line: "\"Stand with us, cross the line for the money, or get both sides into one room.\"",
      choices: [
        { move: "drone:support", label: "Join the picket", detail: "No deliveries for a day" },
        { move: "drone:cross", label: "Fly for double pay", detail: "Money now — enemies later" },
        { move: "drone:negotiate", label: "Broker the talks", detail: "One room, no cameras" },
      ] },
  },
};

export const VOICES: MissionDef = {
  id: "voices", title: "Recovered Voices", brief: "Restore recordings of descendants' stories for a heritage centre on the Badagry Road.", faction: "Orisa Data Keepers",
  beats: {
    '': { at: [6.463,3.315], radius: 60, objective: 'Meet Mrs Hunpatin at', place: "the heritage centre, Mile 2", who: "Mrs Hunpatin, curator",
      line: "\"These tapes hold the voices of families who remember the old Badagry route — the sorrow and the survival. Half are damaged. The rest are in a museum in Europe.\"",
      choices: [{ move: 'accept', label: "I'll help restore them", detail: "Start Recovered Voices" }] },
    decide: { at: [6.463,3.315], radius: 70, objective: 'Decide what to do at', place: "the heritage centre, Mile 2", who: "Mrs Hunpatin",
      line: "\"We can visit the elders and record again, ask the whole city for help, or ask the museum abroad to return what it holds.\"",
      choices: [
        { move: "voices:elders", label: "Travel to the elders", detail: "Record the stories again, in person" },
        { move: "voices:crowd", label: "Crowdsource the restoration", detail: "Lagos listens and helps" },
        { move: "voices:museum", label: "Negotiate with the museum abroad", detail: "Long letters, a slow yes" },
      ] },
  },
};

export const BANKRUN: MissionDef = {
  id: "bankrun", title: "Blackout Bank Run", brief: "A cyber-attack freezes the banks on Broad Street, and crowds panic.", faction: "Yaba Collective",
  beats: {
    '': { at: { landmark: "union-bank" }, radius: 60, objective: 'Meet Mr Coker at', place: "Broad Street", who: "Mr Coker, branch manager",
      line: "\"Every system is frozen — no cards, no transfers, nothing. There are five hundred people at my door and the rumour is that the money is gone. It is not gone. I think.\"",
      choices: [{ move: 'accept', label: "Let's calm this down", detail: "Start Blackout Bank Run" }] },
    decide: { at: { landmark: "union-bank" }, radius: 70, objective: 'Decide what to do at', place: "Broad Street", who: "Mr Coker",
      line: "\"The ÀJỌ savings groups have cash. The Yaba hackers say they can trace the attack. Or we just... keep people calm.\"",
      choices: [
        { move: "bank:ajo", label: "Bring in ÀJỌ cash", detail: "The market women's savings save the banks" },
        { move: "bank:trace", label: "Track the attackers", detail: "With the Yaba hackers" },
        { move: "bank:peace", label: "Keep peace at the branches", detail: "Water, chairs, and information" },
      ] },
  },
};

export const FINALE: MissionDef = {
  id: "finale", title: "The Gate Decision", brief: "A once-in-a-century storm. WYRD can save Eko Atlantic or Makoko, not both fully — and it is asking you.", faction: "WYRD",
  beats: {
    '': { at: { landmark: "civic" }, radius: 60, objective: 'Meet WYRD at', place: "the Civic Centre, Victoria Island", who: "WYRD",
      line: "\"The storm arrives in six hours. I can open the gates to protect Eko Atlantic, or to protect Makoko. Not both, not fully. I have run the numbers ten thousand times. I want a human to decide.\"",
      choices: [{ move: 'accept', label: "I'm here. Tell me everything.", detail: "Start The Gate Decision" }] },
    decide: { at: { landmark: "civic" }, radius: 70, objective: 'Decide what to do at', place: "the Civic Centre, Victoria Island", who: "WYRD",
      line: "\"Eko Atlantic. Makoko. Or — if you believe it — a third way, with every boat, union, drone and church you know. Or give the choice to the people.\"",
      choices: [
        { move: "gate:atlantic", label: "Save Eko Atlantic", detail: "The towers stand; the waterfront floods" },
        { move: "gate:makoko", label: "Save Makoko", detail: "The waterfront stands; the new city floods" },
        { move: "gate:third", label: "Find a third way", detail: "Boats, unions, drones, faith halls — everyone" },
        { move: "gate:assembly", label: "Give it to a citizens' assembly", detail: "Lagos decides for itself" },
      ] },
  },
};

/** where WYRD's faulty unit T-31 stands: the Mushin junction the okada riders complain about */
export const T31_AT: LatLon = [6.5318, 3.3478];

export const T31: MissionDef = {
  id: 't31', title: 'Unit T-31', brief: 'A WYRD traffic unit in Mushin is fining okada riders for speeds nobody could reach.', faction: 'NURTW',
  beats: {
    '': { at: [6.5296, 3.3462], radius: 60, objective: 'Meet Rasheed at', place: 'the okada park, Mushin', who: "Rasheed, okada riders' chairman",
      line: '"That T-31 for the junction dey fine my boys for 90, 100 km/h. Abeg -- my okada no fit pass 70 even if devil push am! Na lie the machine dey tell. Help us prove am."',
      choices: [{ move: 'accept', label: 'I go check the machine', detail: 'Start Unit T-31' }] },
    pace: { at: T31_AT, radius: 90, objective: 'Drive past T-31 at a steady speed at', place: 'the Mushin junction', arriveMove: 'pace', vehicle: true, who: '', line: '', choices: [] },
    witnesses: { at: T31_AT, radius: 90, objective: 'Find people who saw it at', place: 'the Mushin junction', who: 'Mama Kudi, roadside seller',
      line: '"Every day, every day. The machine flash, the boys get message say dem speed -- and dem dey crawl past me like snail. Who go believe us?"',
      choices: [
        { move: 'witness:listen', label: 'Take everyone\'s statements', detail: 'Slow and thorough: the street will remember who listened' },
        { move: 'witness:cctv', label: 'Buy the phone shop\'s CCTV (₦1,000)', detail: 'A week of footage: bikes crawling, T-31 flashing' },
      ] },
    compare: { at: [6.5095, 3.3711], radius: 60, objective: 'Compare T-31\'s log with the city\'s at', place: "WYRD's data office, Yaba", who: 'WYRD',
      line: '"T-31 says one thing. My patrols and these people say another. You\'ve done the work -- how do you want this told?"',
      choices: [
        { move: 'expose:wyrd', label: 'File it with WYRD', detail: 'The proper way: WYRD checks, fixes, refunds' },
        { move: 'expose:press', label: 'Take it to the press', detail: 'Loud: the whole city hears how the robot lied' },
        { move: 'expose:riders', label: "Give it to the riders' union", detail: "Rasheed's people carry it to WYRD themselves" },
      ] },
  },
};

export const MISSIONS = [TOMATO, T31, GRIDLOCK, SCHOOL, MASTERS, WATER, GENERATOR, OWAMBE, SEAWALL, UNION, PHONE, EYO, CONTAINER, STARTUP, GOAT, FLOOD, LEAK, PEPPERSOUP, GHOSTBUS, GRANDMA, MATCHDAY, JAPA, DRONESTRIKE, VOICES, BANKRUN, FINALE];

/** where a beat happens, in world metres (landmarks from their snapped positions) */
export function beatPoint(b: Beat, marks: { id: string; x: number; z: number }[]) {
  if ('landmark' in b.at) { const lm = b.at.landmark; const m = marks.find((q) => q.id === lm); return m ? { x: m.x, z: m.z + 20 } : null; }
  return toXZ(b.at);
}
