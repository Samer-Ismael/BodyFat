import { navyBodyFatPct } from "./navy.js";

export const BF_METHODS = ["navy", "bmi_male", "bmi_female"] as const;
export type BfMethod = (typeof BF_METHODS)[number];

function ymdParts(iso: string): [y: number, m: number, d: number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]),
    mo = Number(m[2]),
    d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return [y, mo, d];
}

/** Completed years on `asOfISO` (calendar date, UTC date parts). */
export function ageCompletedYears(birthISO: string, asOfISO: string): number | null {
  const b = ymdParts(birthISO);
  const a = ymdParts(asOfISO);
  if (!b || !a) return null;
  if (a[0] < b[0] || (a[0] === b[0] && (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])))) return null;
  let years = a[0] - b[0];
  if (a[1] < b[1] || (a[1] === b[1] && a[2] < b[2])) years--;
  if (years < 0 || years > 120) return null;
  return years;
}

/** Deurenberg et al. (1991) — uses BMI + age; less accurate than tape methods but needs no neck. */
export function bmiDeurenbergPct(weightKg: number, heightCm: number, ageYears: number, male: boolean): number | null {
  const hM = heightCm / 100;
  if (hM <= 0 || weightKg <= 0 || ageYears < 16 || ageYears > 100) return null;
  const bmi = weightKg / (hM * hM);
  const bf = 1.2 * bmi + 0.23 * ageYears - (male ? 16.2 : 5.4);
  if (!Number.isFinite(bf)) return null;
  if (bf < 2 || bf > 70) return null;
  return Math.round(bf * 100) / 100;
}

export function entryBodyFatPct(
  method: BfMethod,
  args: {
    waistCm: number;
    neckCm: number;
    heightCm: number;
    weightKg: number;
    birthDateIso: string;
    asOfDateIso: string;
  }
): number | null {
  if (method === "navy") {
    return navyBodyFatPct(args.waistCm, args.neckCm, args.heightCm);
  }
  const ageYears = ageCompletedYears(args.birthDateIso, args.asOfDateIso);
  if (ageYears == null) return null;
  const male = method === "bmi_male";
  return bmiDeurenbergPct(args.weightKg, args.heightCm, ageYears, male);
}
