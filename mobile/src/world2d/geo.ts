/**
 * Where things are in NAIJA 2099's Lagos. The world is in metres around Ojuelegba junction (the same
 * origin as the map tiles): x runs east, z runs south.
 */
export type LatLon = [number, number];

export const ORIGIN = { lat: 6.50955, lon: 3.36395 };
const KX = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180), KZ = 110540;
export const toXZ = ([lat, lon]: LatLon) => ({ x: (lon - ORIGIN.lon) * KX, z: -(lat - ORIGIN.lat) * KZ });

/** The famous places, each drawn as its own picture: where it stands, and how wide it is (m). */
export type Landmark = { id: string; name: string; at: LatLon; sprite: string; width: number;
  /** open places (squares, parks, beaches, bridges, parks of buses) stand where they are, not on a building */ open?: boolean };
export const LANDMARKS: Landmark[] = [
  { id: 'civic', name: 'Lagos Civic Centre', at: [6.44012, 3.43087], sprite: 'lm-civic-centre', width: 70 },
  { id: 'theatre', name: 'National Theatre', at: [6.47468, 3.36877], sprite: 'lm-national-theatre', width: 150 },
  { id: 'cathedral', name: 'Cathedral Church of Christ', at: [6.45089, 3.39020], sprite: 'lm-cathedral', width: 70 },
  { id: 'lekki-toll', name: 'Lekki Toll Gate', at: [6.43593, 3.44721], sprite: 'lm-lekki-toll', width: 160 },
  { id: 'eko-hotel', name: 'Eko Hotel', at: [6.42661, 3.43030], sprite: 'lm-eko-hotel', width: 140 },
  { id: 'balogun', name: 'Balogun Market', at: [6.4553, 3.3903], sprite: 'lm-balogun', width: 140, open: true }, // the market streets between the mosque and Tinubu Square
  { id: 'stadium', name: 'National Stadium', at: [6.49827, 3.36457], sprite: 'lm-stadium', width: 260 },
  { id: 'tbs', name: 'Tafawa Balewa Square', at: [6.4476, 3.3986], sprite: 'lm-tbs', width: 220 },
  { id: 'airport', name: 'Murtala Muhammed Airport', at: [6.5774, 3.3212], sprite: 'lm-airport', width: 300 },
  { id: 'mall', name: 'Ikeja City Mall', at: [6.61432, 3.35780], sprite: 'lm-mall', width: 180 },
  { id: 'eko-atlantic', name: 'Eko Atlantic', at: [6.4067, 3.4106], sprite: 'lm-eko-atlantic', width: 400 },
  { id: 'ojuelegba', name: 'Ojuelegba', at: [6.50955, 3.36395], sprite: 'lm-ojuelegba', width: 140 },
  // the second set: positions from OpenStreetMap (Nominatim); '~' = placed by hand, approximately
  { id: 'central-mosque', name: 'Lagos Central Mosque', at: [6.45738, 3.38814], sprite: 'lm-central-mosque', width: 75 },
  { id: 'tinubu-square', name: 'Tinubu Square', at: [6.45384, 3.38944], sprite: 'lm-tinubu-square', width: 95, open: true },
  { id: 'independence-house', name: 'Independence House', at: [6.44876, 3.39853], sprite: 'lm-independence-house', width: 55 },
  { id: 'necom-house', name: 'NECOM House', at: [6.44647, 3.39775], sprite: 'lm-necom-house', width: 50 },
  { id: 'css-bookshop', name: 'CSS Bookshop', at: [6.4540, 3.3905], sprite: 'lm-css-bookshop', width: 40 }, // ~
  { id: 'union-bank', name: 'Marina bank headquarters', at: [6.45235, 3.38793], sprite: 'lm-union-bank', width: 50 },
  { id: 'city-hall', name: 'Lagos City Hall', at: [6.45065, 3.39714], sprite: 'lm-city-hall', width: 70 },
  { id: 'idumota', name: 'Idumota', at: [6.46294, 3.38669], sprite: 'lm-idumota', width: 80 },
  { id: 'obalende', name: 'Obalende Motor Park', at: [6.4467, 3.4085], sprite: 'lm-obalende', width: 120, open: true }, // ~
  { id: 'falomo', name: 'Falomo Shopping Centre', at: [6.44481, 3.42821], sprite: 'lm-falomo', width: 90 }, // ~
  { id: 'link-bridge', name: 'Lekki-Ikoyi Link Bridge', at: [6.4400, 3.4436], sprite: 'lm-link-bridge', width: 260, open: true }, // ~
  { id: 'bar-beach', name: 'Bar Beach', at: [6.4084, 3.4300], sprite: 'lm-bar-beach', width: 160, open: true }, // on the Atlantic shore, from the coastline data
  { id: 'federal-palace', name: 'Federal Palace Hotel', at: [6.43056, 3.40737], sprite: 'lm-federal-palace', width: 130 },
  { id: 'muri-okunola', name: 'Muri Okunola Park', at: [6.43782, 3.42508], sprite: 'lm-muri-okunola', width: 140, open: true },
  { id: 'unilag-senate', name: 'UNILAG Senate Building', at: [6.5197, 3.39876], sprite: 'lm-unilag-senate', width: 60 },
  { id: 'unilag-gate', name: 'UNILAG Main Gate', at: [6.5150, 3.3880], sprite: 'lm-unilag-gate', width: 60, open: true }, // ~
  { id: 'yaba-market', name: 'Yaba Market', at: [6.5110, 3.3780], sprite: 'lm-yaba-market', width: 110, open: true }, // ~
  { id: 'tejuosho', name: 'Tejuosho Market', at: [6.50815, 3.36975], sprite: 'lm-tejuosho', width: 110 },
  { id: 'oshodi', name: 'Oshodi Interchange', at: [6.55581, 3.35083], sprite: 'lm-oshodi', width: 150 },
  { id: 'computer-village', name: 'Computer Village', at: [6.59425, 3.34022], sprite: 'lm-computer-village', width: 110 },
  { id: 'alausa', name: 'Lagos State Secretariat, Alausa', at: [6.61562, 3.36074], sprite: 'lm-alausa', width: 220 },
  { id: 'rail-terminal', name: 'Mobolaji Johnson Railway Station', at: [6.50177, 3.37368], sprite: 'lm-rail-terminal', width: 220 },
  { id: 'shrine', name: 'New Afrika Shrine', at: [6.62284, 3.35689], sprite: 'lm-shrine', width: 70 },
  { id: 'nike-gallery', name: 'Nike Art Gallery', at: [6.43152, 3.48189], sprite: 'lm-nike-gallery', width: 45 },
];

/** Districts, for the map labels and "where am I". */
export const DISTRICTS: { name: string; at: LatLon }[] = [
  { name: 'Ojuelegba', at: [6.50955, 3.36395] }, { name: 'Yaba', at: [6.5095, 3.3785] }, { name: 'Surulere', at: [6.4985, 3.3535] },
  { name: 'Mushin', at: [6.5273, 3.3449] }, { name: 'Ebute-Metta', at: [6.4878, 3.3805] }, { name: 'Maryland', at: [6.5713, 3.3676] },
  { name: 'Ikeja', at: [6.6018, 3.3515] }, { name: 'Oworonshoki', at: [6.5517, 3.4015] }, { name: 'Apapa', at: [6.4474, 3.3594] },
  { name: 'Lagos Island', at: [6.4541, 3.3947] }, { name: 'Ikoyi', at: [6.4523, 3.4339] }, { name: 'Victoria Island', at: [6.4281, 3.4219] },
  { name: 'Lekki', at: [6.4396, 3.4733] }, { name: 'Eko Atlantic', at: [6.4067, 3.4106] }, { name: 'Festac', at: [6.4683, 3.2833] },
  { name: 'Ikorodu Road', at: [6.545, 3.372] }, { name: 'Oshodi', at: [6.5568, 3.3484] },
];

/** How big each picture is in the world, in metres (its longest side). */
export const SIZE: Record<string, number> = {
  'car-danfo': 7.6, 'car-red': 6.2, 'car-blue': 6.6, 'car-white': 6.6, 'car-purple': 6.4, 'car-grey': 6.3, 'bus-brt': 15, okada: 3.2, boat: 12,
  player: 3.6, 'walker-1': 3.1, 'walker-2': 3.1, 'walker-3': 3.3, 'walker-4': 3.1,
  palm: 8, tree: 6.5, lamp: 6.5, 'stall-yellow': 4, 'stall-blue': 4, 'stall-orange': 4, kiosk: 3.6, bush: 2.2, fountain: 9, busstop: 7,
};
