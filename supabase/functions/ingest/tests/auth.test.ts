import { assertEquals } from "https://deno.land/std@0.220.0/assert/mod.ts";
import { checkScraperToken } from "../lib/auth.ts";

Deno.test("checkScraperToken accepts matching header", () => {
  const req = new Request("http://x", { headers: { "x-scraper-token": "abc" } });
  assertEquals(checkScraperToken(req, "abc"), true);
});

Deno.test("checkScraperToken rejects empty expected", () => {
  const req = new Request("http://x", { headers: { "x-scraper-token": "abc" } });
  assertEquals(checkScraperToken(req, ""), false);
});

Deno.test("checkScraperToken rejects mismatch", () => {
  const req = new Request("http://x", { headers: { "x-scraper-token": "wrong" } });
  assertEquals(checkScraperToken(req, "abc"), false);
});

Deno.test("checkScraperToken rejects missing header", () => {
  const req = new Request("http://x");
  assertEquals(checkScraperToken(req, "abc"), false);
});
