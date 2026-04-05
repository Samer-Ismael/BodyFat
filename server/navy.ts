export function navyBodyFatPct(
  waistCm: number,
  neckCm: number,
  heightCm: number
): number | null {
  if (waistCm <= neckCm || heightCm <= 0) return null;
  try {
    const denom =
      1.0324 -
      0.19077 * Math.log10(waistCm - neckCm) +
      0.15456 * Math.log10(heightCm);
    if (denom === 0) return null;
    return Math.round((495 / denom - 450) * 100) / 100;
  } catch {
    return null;
  }
}
