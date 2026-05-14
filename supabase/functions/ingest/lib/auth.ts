export function checkScraperToken(req: Request, expected: string): boolean {
  if (!expected) return false;
  return req.headers.get("x-scraper-token") === expected;
}
