/**
 * Real Lagos radio, live: the stations' own public internet streams. The games only play them in the player's
 * browser (an audio element pointed at the station's stream) -- nothing is stored or re-broadcast. Shared by the 3D
 * city's Lagos FM and NAIJA 2099's dial.
 */
export type LiveStation = { id: string; name: string; freq: string; tag: string; url: string };

export const LAGOS_STATIONS: LiveStation[] = [
  { id: 'wazobia', name: 'Wazobia FM', freq: '95.1', tag: 'Pidgin · street talk', url: 'https://wazobiafmlagos951-atunwadigital.streamguys1.com/wazobiafmlagos951' },
  { id: 'cool', name: 'Cool FM', freq: '96.9', tag: 'Hits · Afrobeats', url: 'https://coolfmlagos969-atunwadigital.streamguys1.com/coolfmlagos969' },
  { id: 'metro', name: 'Metro FM', freq: '97.7', tag: 'Lagos · talk & music', url: 'https://go.webgateready.com/metrofm' },
  { id: 'nigeriainfo', name: 'Nigeria Info', freq: '99.3', tag: 'News · talk', url: 'https://nigeriainfofmlagos993-atunwadigital.streamguys1.com/nigeriainfofmlagos993' },
  { id: 'bond', name: 'Bond FM', freq: '92.9', tag: 'Lagos classic', url: 'https://go.webgateready.com/bondfm' },
  { id: 'goradio', name: 'GoRadio', freq: 'online', tag: 'Lagos online', url: 'https://online.goradio.com.ng/listen/gr/radio.mp3' },
];
