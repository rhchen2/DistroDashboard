import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("accepts a minimal valid config", () => {
    const json = {
      ingestUrl: "http://example.com",
      scraperToken: "tok",
      distros: { gts: { username: "u", password: "p" } },
    };
    expect(() => parseConfig(json)).not.toThrow();
  });

  it("rejects missing ingestUrl", () => {
    expect(() => parseConfig({ scraperToken: "tok", distros: {} })).toThrow();
  });

  it("rejects empty scraperToken", () => {
    expect(() =>
      parseConfig({ ingestUrl: "http://x", scraperToken: "", distros: {} }),
    ).toThrow();
  });
});
