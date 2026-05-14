import { describe, expect, it } from "vitest";
import { isSuspiciousZero } from "../src/core/tripwire.js";

describe("isSuspiciousZero", () => {
  it("returns false when current > 0", () => {
    expect(isSuspiciousZero(5, 10)).toBe(false);
  });
  it("returns false when prior is null (first ever run)", () => {
    expect(isSuspiciousZero(0, null)).toBe(false);
  });
  it("returns false when prior was 0", () => {
    expect(isSuspiciousZero(0, 0)).toBe(false);
  });
  it("returns true when current is 0 and prior was > 0", () => {
    expect(isSuspiciousZero(0, 7)).toBe(true);
  });
});
