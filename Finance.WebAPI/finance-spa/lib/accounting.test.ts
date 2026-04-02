import {
  getAccountEffectForSplitSide,
  getBalanceDeltaForAccount,
  getDisplayBalanceForAccount,
  getDisplaySplitAmountForAccount,
  getOppositeSide,
  getSignedAmount,
  getSplitSideForAccountEffect,
  getSplitSideLabel,
  getStoredBalanceFromDisplay,
  getTwoSplitAccountLabel,
  normalizeSplitSide,
} from "./accounting"

describe("accounting helpers", () => {
  it("normalizes split side from explicit values and amount fallback", () => {
    expect(normalizeSplitSide(" debit ")).toBe("debit")
    expect(normalizeSplitSide("credit")).toBe("credit")
    expect(normalizeSplitSide(undefined, -10)).toBe("debit")
    expect(normalizeSplitSide(undefined, 10)).toBe("credit")
  })

  it("returns signed amounts by posting side", () => {
    expect(getSignedAmount(125, "debit")).toBe(-125)
    expect(getSignedAmount(125, "credit")).toBe(125)
    expect(getOppositeSide("debit")).toBe("credit")
    expect(getSplitSideLabel("credit", "short")).toBe("Cr")
  })

  it("computes account balance deltas correctly for debit-normal accounts", () => {
    expect(getBalanceDeltaForAccount("Asset", { amount: 50, side: "debit" })).toBe(50)
    expect(getBalanceDeltaForAccount("Asset", { amount: 50, side: "credit" })).toBe(-50)
    expect(getAccountEffectForSplitSide("Asset", "debit")).toBe("increase")
    expect(getSplitSideForAccountEffect("Asset", "decrease")).toBe("credit")
  })

  it("computes account balance deltas correctly for credit-normal accounts", () => {
    expect(getBalanceDeltaForAccount("Liability", { amount: 50, side: "credit" })).toBe(50)
    expect(getBalanceDeltaForAccount("Liability", { amount: 50, side: "debit" })).toBe(-50)
    expect(getAccountEffectForSplitSide("Liability", "credit")).toBe("increase")
    expect(getSplitSideForAccountEffect("Liability", "decrease")).toBe("debit")
  })

  it("translates between stored and displayed balances", () => {
    expect(getDisplayBalanceForAccount("Liability", 120)).toBe(-120)
    expect(getStoredBalanceFromDisplay("Liability", -120)).toBe(120)
    expect(getDisplayBalanceForAccount("Income", -120)).toBe(120)
    expect(getDisplaySplitAmountForAccount("Income", { amount: 35, side: "credit" })).toBe(35)
  })

  it("labels two-split flows from the primary side", () => {
    expect(getTwoSplitAccountLabel(0, "debit")).toBe("To account")
    expect(getTwoSplitAccountLabel(1, "debit")).toBe("From account")
    expect(getTwoSplitAccountLabel(0, "credit")).toBe("From account")
    expect(getTwoSplitAccountLabel(1, "credit")).toBe("To account")
  })
})
