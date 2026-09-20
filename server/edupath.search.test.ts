import { describe, expect, it } from "vitest";
import { heuristicSearch, verifiedPrograms } from "./routers";
import { deadlineStatus } from "../client/src/pages/Home";

describe("EduPath natural-language search fallback", () => {
  it("finds subject matches from a plain-language request", () => {
    const result = heuristicSearch("I want to study computer science in Turkey");
    expect(result.universityIds).toContain(2);
    expect(result.summary).toContain("found");
  });

  it("uses the annual budget when a budget is present", () => {
    const result = heuristicSearch("English-taught universities under $8,000");
    expect(result.interpretedBudget).toBe(8000);
    expect(result.universityIds).toEqual(expect.arrayContaining([1, 3, 4]));
    expect(result.universityIds).not.toContain(5);
  });

  it("never returns an ID outside the seeded catalog", () => {
    const result = heuristicSearch("something very specific that does not exist");
    expect(result.universityIds.every(id => id >= 1 && id <= 6)).toBe(true);
  });

  it("understands Arabic subject and destination terms", () => {
    const result = heuristicSearch("أريد دراسة الطب باللغة الإنجليزية في المجر");
    expect(result.universityIds).toEqual(expect.arrayContaining([1, 3]));
    expect(result.summary).toContain("وجدت");
  });

  it("has verified tuition and deadline evidence for every researched university", () => {
    Object.values(verifiedPrograms).forEach(programs => {
      expect(programs.length).toBeGreaterThanOrEqual(2);
      programs.forEach(program => {
        expect(program.tuitionAmount).toBeGreaterThan(0);
        expect(program.tuitionCurrency).toMatch(/^[A-Z]{3}$/);
        expect(program.applicationDeadline.length).toBeGreaterThan(4);
        expect(program.sourceUrl).toMatch(/^https:\/\//);
      });
    });
  });

  it("flags fixed deadlines in the next 30 days and leaves rolling deadlines neutral", () => {
    const soonDate = new Date(Date.now() + 7 * 86400000);
    const soon = `${soonDate.getDate()} ${soonDate.toLocaleString("en-US", { month: "long" })} ${soonDate.getFullYear()}`;
    const urgent = deadlineStatus(soon);
    expect(urgent.approaching).toBe(true);
    expect(deadlineStatus("Rolling; may close at short notice").approaching).toBe(false);
  });
});
