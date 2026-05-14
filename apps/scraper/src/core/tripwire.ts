export function isSuspiciousZero(currentCount: number, priorCount: number | null): boolean {
  if (currentCount > 0) return false;
  if (priorCount === null) return false;
  return priorCount > 0;
}
