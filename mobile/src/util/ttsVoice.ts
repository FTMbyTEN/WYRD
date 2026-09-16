import * as Speech from 'expo-speech';

// WYRD's voice is female — a fixed identity trait, not a per-user preference. expo-speech's
// Voice type has no gender field on any platform, so matching by name against the female voices
// actually shipped by iOS/Android/desktop TTS engines is the only real option (same list used on
// the web client for the same reason — see public/app.js's pickTtsVoice). Tone/pitch tuning
// ("we'll work more on her voice later") is intentionally left plain here — this only settles
// *which* voice, not the character read on top of it.
const FEMALE_VOICE_HINTS = /female|zira|hazel|susan|samantha|victoria|karen|moira|tessa|fiona|serena|ava|allison|vicki|salli|joanna|kendra|kimberly|ivy/i;

let cachedVoiceId: string | null | undefined;

async function resolveFemaleVoiceId(): Promise<string | null> {
  if (cachedVoiceId !== undefined) return cachedVoiceId;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const matches = voices.filter((v) => FEMALE_VOICE_HINTS.test(v.name));
    const pick = matches.find((v) => /^en/i.test(v.language)) || matches[0] || null;
    cachedVoiceId = pick ? pick.identifier : null;
  } catch {
    cachedVoiceId = null;
  }
  return cachedVoiceId;
}

/** Speaks as WYRD — resolves and applies her voice, then delegates to Speech.speak. */
export async function speakAsWyrd(text: string) {
  const voice = await resolveFemaleVoiceId();
  Speech.speak(text, {
    voice: voice || undefined,
    pitch: 1.1,  // a touch above neutral — plain for now, revisited later
    rate: 0.95,  // near-natural pace
  });
}
