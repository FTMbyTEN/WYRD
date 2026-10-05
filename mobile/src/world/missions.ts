import type { CityMission } from '../api/types';

/**
 * The street board: missions on real Lagos streets that are always open, signed in or not. WYRD's own
 * board (written on the server) is added on top when you're signed in. Positions are the streets'
 * places in the world (metres from Ojuelegba), from streets.json.
 */
export const STARTER_MISSIONS: CityMission[] = [
  { id: 'st-tejuosho', kind: 'deliver', title: 'Fabric for Tejuosho', brief: 'A trader at Tejuosho market is waiting on a roll of Adire. Get it to her before the rain.', street: 'Tejuosho Avenue', x: 600, z: 571, reward: 3 },
  { id: 'st-flyover', kind: 'reach', title: 'Under the Yaba flyover', brief: "WYRD's sensors went dark under the Yaba flyover. Go and look.", street: 'Yaba Flyover Bridge', x: 810, z: -13, reward: 2 },
  { id: 'st-herbert', kind: 'find', title: 'Lost phone on Herbert Macaulay', brief: 'Someone dropped a phone near the tech hubs on Herbert Macaulay Way. Find it.', street: 'Herbert Macaulay Way', x: 1613, z: 414, reward: 3 },
  { id: 'st-bode', kind: 'greet', title: 'Mama put on Bode Thomas', brief: 'Say hello to the people of Bode Thomas Street -- word travels in Surulere.', street: 'Bode Thomas Street', x: -535, z: 941, reward: 2 },
  { id: 'st-itire', kind: 'reach', title: 'Danfo jam on Itire Road', brief: 'Traffic has locked Itire Road. Get there and report what you see.', street: 'Itire Road', x: -785, z: -281, reward: 2 },
  { id: 'st-akerele', kind: 'deliver', title: 'Jollof run to Akerele', brief: 'Party at Akerele Road tonight and the jollof is late. Run it over.', street: 'Akerele Road', x: -735, z: 710, reward: 3 },
  { id: 'st-3mb', kind: 'reach', title: 'Third Mainland at night', brief: 'Cross to the middle of Third Mainland Bridge and watch the lagoon lights.', street: 'Third Mainland Bridge', x: 3497, z: 2472, reward: 4 },
  { id: 'st-broad', kind: 'deliver', title: 'Papers to Broad Street', brief: 'A bank on Broad Street needs documents from the mainland. Fly them over.', street: 'Broad Street', x: 3228, z: 6564, reward: 5 },
];
