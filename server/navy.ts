export function navyBodyFatPct(waistCm: number, neckCm: number, heightCm: number): number | null {
  if (waistCm <= neckCm || heightCm <= 0) return null;
  const denom =
    1.0324 - 0.19077 * Math.log10(waistCm - neckCm) + 0.15456 * Math.log10(heightCm);
  if (denom === 0 || !Number.isFinite(denom)) return null;
  const pct = 495 / denom - 450;
  return Number.isFinite(pct) ? Math.round(pct * 100) / 100 : null;
}
