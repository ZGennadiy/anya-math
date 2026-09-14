export function createRng(seed) {
  let state = seed >>> 0;
  return () => {
    state += 0x6D2B79F5;
    let t = state;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
export const int = (rng, min, max) => min + Math.floor(rng() * (max - min + 1));
export const pick = (rng, values) => values[int(rng, 0, values.length - 1)];
export function shuffle(rng, values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) { const j = int(rng, 0, i); [result[i], result[j]] = [result[j], result[i]]; }
  return result;
}
export function newSeed(previous) {
  const bytes = new Uint32Array(1);
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(bytes);
  else bytes[0] = (Date.now() ^ Math.floor(Math.random() * 4294967296)) >>> 0;
  return bytes[0] === previous ? (bytes[0] + 1) >>> 0 : bytes[0];
}
