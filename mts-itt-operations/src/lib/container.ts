import type { ContainerSize } from "@/types/terminal";

const LETTER_VALUES: Record<string, number> = {};
(() => {
  let v = 10;
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (v % 11 === 0) v++;
    LETTER_VALUES[ch] = v;
    v++;
  }
})();

export function checkDigit(first10: string): number {
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const c = first10[i];
    const val = /[A-Z]/.test(c) ? LETTER_VALUES[c] : Number(c);
    sum += val * 2 ** i;
  }
  return (sum % 11) % 10;
}

export function normalizeContainerNo(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export type ContainerCheck = "ok" | "missing" | "format" | "check-digit";

export function checkContainerNo(raw: string | undefined | null): ContainerCheck {
  if (!raw || !raw.trim()) return "missing";
  const s = normalizeContainerNo(raw);
  if (!/^[A-Z]{3}[UJZ]\d{7}$/.test(s)) return "format";
  return checkDigit(s.slice(0, 10)) === Number(s[10]) ? "ok" : "check-digit";
}

export const isValidContainerNo = (s: string) => checkContainerNo(s) === "ok";

export function formatContainerNo(s: string): string {
  const n = normalizeContainerNo(s);
  return n.length === 11 ? `${n.slice(0, 4)} ${n.slice(4, 10)} ${n.slice(10)}` : s;
}

/** Build a valid ISO 6346 number from a 4-letter prefix (ending in U/J/Z) and a 6-digit serial. */
export function makeContainerNo(prefix: string, serial: number): string {
  const body = prefix + String(serial % 1_000_000).padStart(6, "0");
  return body + checkDigit(body);
}

export function sizeFromIsoCode(code: string | undefined): ContainerSize | null {
  if (!code) return null;
  const c = code.toUpperCase().replace(/\s|'|FT|GP|HC|DC/g, "");
  if (c.startsWith("2") || c === "20") return "20FT";
  if (c.startsWith("4") || c === "40") return "40FT";
  return null;
}
