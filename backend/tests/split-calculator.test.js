import { describe, expect, it } from "vitest";
import { calculateParticipantAmounts } from "../src/modules/expenses/split-calculator.js";

const alice = "8d0135e4-5012-4d91-92b1-8dfeb0fb20cc";
const bob = "93f40da0-1f19-45a0-8f71-058c1b5c25dd";
const casey = "a83e2622-b037-42c5-8d1d-aec15fcff24f";

describe("expense split calculator", () => {
  it("allocates equal splits and absorbs the rounding remainder", () => {
    const result = calculateParticipantAmounts("10.00", "EQUAL", [
      { userId: alice },
      { userId: bob },
      { userId: casey },
    ]);

    expect(result).toEqual([
      { userId: alice, amount: "3.3333" },
      { userId: bob, amount: "3.3333" },
      { userId: casey, amount: "3.3334" },
    ]);
  });

  it("accepts exact split amounts only when they equal the expense total", () => {
    expect(
      calculateParticipantAmounts("12.00", "EXACT", [
        { userId: alice, amount: "7.00" },
        { userId: bob, amount: "5.00" },
      ]),
    ).toEqual([
      { userId: alice, amount: "7.0000" },
      { userId: bob, amount: "5.0000" },
    ]);

    expect(() =>
      calculateParticipantAmounts("12.00", "EXACT", [
        { userId: alice, amount: "7.00" },
        { userId: bob, amount: "4.00" },
      ]),
    ).toThrow("must equal");
  });

  it("calculates percentage splits totaling 100", () => {
    expect(
      calculateParticipantAmounts("80", "PERCENTAGE", [
        { userId: alice, percentage: "75" },
        { userId: bob, percentage: "25" },
      ]),
    ).toEqual([
      { userId: alice, amount: "60.0000" },
      { userId: bob, amount: "20.0000" },
    ]);
  });

  it("calculates custom weighted splits", () => {
    expect(
      calculateParticipantAmounts("120", "CUSTOM", [
        { userId: alice, weight: "1" },
        { userId: bob, weight: "2" },
        { userId: casey, weight: "3" },
      ]),
    ).toEqual([
      { userId: alice, amount: "20.0000" },
      { userId: bob, amount: "40.0000" },
      { userId: casey, amount: "60.0000" },
    ]);
  });

  it("rejects duplicate participants and invalid percentage totals", () => {
    expect(() =>
      calculateParticipantAmounts("10", "EQUAL", [{ userId: alice }, { userId: alice }]),
    ).toThrow("unique");

    expect(() =>
      calculateParticipantAmounts("10", "PERCENTAGE", [
        { userId: alice, percentage: "50" },
        { userId: bob, percentage: "40" },
      ]),
    ).toThrow("total 100");
  });
});

