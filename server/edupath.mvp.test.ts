import { describe, expect, it } from "vitest";
import { calculateAnnualCost, convertCurrency, monthlyCost } from "../shared/edupath";

describe("EduPath cost planning", () => {
  it("adds tuition, living, and one-time costs into an annual estimate", () => {
    expect(calculateAnnualCost(7200, 4200, 1200)).toBe(12600);
  });

  it("converts USD estimates using the supported display currency rate", () => {
    expect(convertCurrency(12600, "EUR")).toBe(11592);
    expect(convertCurrency(12600, "AED")).toBe(46242);
  });

  it("rounds annual estimates to a whole monthly planning number", () => {
    expect(monthlyCost(12600)).toBe(1050);
    expect(monthlyCost(10000)).toBe(833);
  });
});
