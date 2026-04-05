import { BF_METHODS, type BfMethod } from "./bodyfat.js";

/** node:sqlite may return numbers as strings or bigint ids; Chart.js and .toFixed() need finite numbers. */
export function num(v: unknown, fallback = NaN): number {
  if (typeof v === "bigint") {
    const x = Number(v);
    return Number.isFinite(x) ? x : fallback;
  }
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function entryRow(r: Record<string, unknown>) {
  const id = num(r.id, NaN);
  return {
    id: Number.isFinite(id) ? id : 0,
    entry_date: String(r.entry_date ?? ""),
    weight_kg: num(r.weight_kg, NaN),
    waist_cm: num(r.waist_cm, NaN),
    neck_cm: num(r.neck_cm, NaN),
  };
}

export function userRow(r: Record<string, unknown>) {
  const id = num(r.id, NaN);
  return {
    id: Number.isFinite(id) && id > 0 ? id : 0,
    name: String(r.name ?? "").trim(),
  };
}

export function parseBfMethod(v: unknown): BfMethod {
  const s = String(v ?? "navy");
  return (BF_METHODS as readonly string[]).includes(s) ? (s as BfMethod) : "navy";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function parseBirthDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  if (!ISO_DATE.test(s)) return null;
  const [y, mo, d] = s.split("-").map(Number);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return s;
}

export function settingsRow(r: Record<string, unknown> | undefined) {
  const defaultBirth = "1990-01-01";
  if (!r) {
    return {
      height_cm: 178,
      goal_body_fat: 12,
      goal_waist_cm: 83,
      goal_weight_kg: 82,
      bf_method: "navy" as BfMethod,
      birth_date: defaultBirth,
      plan_total_days: 0,
      plan_start_date: null as string | null,
    };
  }
  const planDays = Math.max(0, Math.min(3650, Math.floor(num(r.plan_total_days, 0))));
  const planStart = parseBirthDate(r.plan_start_date);
  return {
    height_cm: num(r.height_cm, 178),
    goal_body_fat: num(r.goal_body_fat, 12),
    goal_waist_cm: num(r.goal_waist_cm, 83),
    goal_weight_kg: num(r.goal_weight_kg, 82),
    bf_method: parseBfMethod(r.bf_method),
    birth_date: parseBirthDate(r.birth_date) ?? defaultBirth,
    plan_total_days: planDays,
    plan_start_date: planStart,
  };
}
