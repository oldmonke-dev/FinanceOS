const { authFetchMock } = vi.hoisted(() => ({
  authFetchMock: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
  authFetch: authFetchMock,
}))

import {
  createTransaction,
  deleteTransaction,
  getTransactions,
  updateTransaction,
} from "./transactions"

function jsonResponse(body: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  })
}

describe("transactions client", () => {
  beforeEach(() => {
    authFetchMock.mockReset()
  })

  it("creates a transaction and normalizes split amounts and sides", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse({
        id: "txn-1",
        transactionDate: "2026-03-31T00:00:00Z",
        ledgerSequence: 1,
        description: "Imported txn",
        referenceNumber: null,
        createdAt: "2026-03-31T00:00:00Z",
        splits: [
          {
            id: "split-1",
            accountId: "acc-1",
            amount: -25,
            side: null,
            memo: "memo 1",
          },
          {
            id: "split-2",
            accountId: "acc-2",
            amount: 25,
            side: "credit",
            memo: null,
          },
        ],
      }),
    )

    const result = await createTransaction({
      transactionDate: "2026-03-31T00:00:00Z",
      description: "Imported txn",
      splits: [],
    })

    expect(authFetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/Transactions",
      expect.objectContaining({
        method: "POST",
      }),
    )
    expect(result.splits).toEqual([
      {
        id: "split-1",
        accountId: "acc-1",
        amount: 25,
        side: "debit",
        memo: "memo 1",
      },
      {
        id: "split-2",
        accountId: "acc-2",
        amount: 25,
        side: "credit",
        memo: null,
      },
    ])
  })

  it("adds accountId to the transactions query string", async () => {
    authFetchMock.mockResolvedValue(jsonResponse([]))

    await getTransactions("account-7")

    expect(authFetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/Transactions?accountId=account-7"),
      expect.objectContaining({
        cache: "no-store",
      }),
    )
  })

  it("throws when transactions response is not an array", async () => {
    authFetchMock.mockResolvedValue(jsonResponse({ invalid: true }))

    await expect(getTransactions()).rejects.toThrow("Transactions response was not an array")
  })

  it("surfaces API messages on update failure", async () => {
    authFetchMock.mockResolvedValue(
      jsonResponse(
        {
          message: "You cannot edit this transaction.",
        },
        {
          status: 400,
        },
      ),
    )

    await expect(
      updateTransaction("txn-7", {
        description: "Updated",
        splits: [],
      }),
    ).rejects.toThrow("You cannot edit this transaction.")
  })

  it("calls delete on the transaction endpoint", async () => {
    authFetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await deleteTransaction("txn-delete")

    expect(authFetchMock).toHaveBeenCalledWith(
      "http://localhost:3000/Transactions/txn-delete",
      expect.objectContaining({
        method: "DELETE",
      }),
    )
  })
})
