/** Deterministic PRNG (mulberry32) so seeded demo data is identical on every machine. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Rand = () => number;
export const pick = <T,>(r: Rand, arr: readonly T[]): T => arr[Math.floor(r() * arr.length)];
export const int = (r: Rand, min: number, max: number) => min + Math.floor(r() * (max - min + 1));
export const chance = (r: Rand, p: number) => r() < p;

/** Non-cryptographic 64-bit-ish hex hash, used only as a fallback fingerprint and for seed data. */
export function fnvHex(input: string | Uint8Array): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ 0xdeadbeef;
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  for (let i = 0; i < bytes.length; i++) {
    h1 = Math.imul(h1 ^ bytes[i], 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ bytes[i], 0x85ebca6b) >>> 0;
  }
  const hex = (n: number) => n.toString(16).padStart(8, "0");
  return hex(h1) + hex(h2) + hex(h1 ^ h2) + hex(Math.imul(h1, 31) ^ h2);
}
