import {
  getTransactionDateKey,
  isTransactionDateInRange,
  parseDateKeyToLocalDate,
} from "./transaction-date"

describe("transaction-date helpers", () => {
  it("keeps the calendar day from an ISO timestamp", () => {
    expect(getTransactionDateKey("2024-01-01T23:30:00.000Z")).toBe("2024-01-01")
  })

  it("includes older transactions when the custom range starts on that day", () => {
    expect(
      isTransactionDateInRange("2023-04-01T23:59:59.999Z", {
        from: "2023-04-01",
        to: "2024-03-31",
      }),
    ).toBe(true)
  })

  it("excludes transactions before the custom from date", () => {
    expect(
      isTransactionDateInRange("2023-03-31T23:59:59.999Z", {
        from: "2023-04-01",
      }),
    ).toBe(false)
  })

  it("parses date keys as local calendar dates", () => {
    const date = parseDateKeyToLocalDate("2026-03-31")

    expect(date.getFullYear()).toBe(2026)
    expect(date.getMonth()).toBe(2)
    expect(date.getDate()).toBe(31)
  })
})
