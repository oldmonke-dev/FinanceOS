import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { SnackbarProvider, useSnackbar } from "./snackbar-provider"

function Consumer() {
  const { showSnackbar } = useSnackbar()

  return (
    <div>
      <button
        type="button"
        onClick={() => showSnackbar({ message: "Saved", tone: "success", durationMs: 1000 })}
      >
        Success
      </button>
      <button
        type="button"
        onClick={() => showSnackbar({ message: "Failed", tone: "error", durationMs: 1000 })}
      >
        Error
      </button>
      <button
        type="button"
        onClick={() => showSnackbar({ message: "Info only" })}
      >
        Info
      </button>
    </div>
  )
}

describe("SnackbarProvider", () => {
  it("renders queued snackbars", async () => {
    render(
      <SnackbarProvider>
        <Consumer />
      </SnackbarProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Success" }))
    fireEvent.click(screen.getByRole("button", { name: "Error" }))

    expect(screen.getByText("Saved")).toBeInTheDocument()
    expect(screen.getByText("Failed")).toBeInTheDocument()
  })

  it("auto dismisses snackbars after their duration", async () => {
    vi.useFakeTimers()

    render(
      <SnackbarProvider>
        <Consumer />
      </SnackbarProvider>,
    )

    fireEvent.click(screen.getByRole("button", { name: "Info" }))
    expect(screen.getByText("Info only")).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(2000)
    })

    expect(screen.queryByText("Info only")).not.toBeInTheDocument()

    vi.useRealTimers()
  })
})
