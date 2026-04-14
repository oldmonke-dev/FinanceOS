const { useRouterMock, confirmMock, pushMock } = vi.hoisted(() => ({
  useRouterMock: vi.fn(),
  confirmMock: vi.fn(),
  pushMock: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: useRouterMock,
}))

vi.mock("@/components/providers/confirmation-dialog-provider", () => ({
  useConfirmationDialog: () => ({
    confirm: confirmMock,
  }),
}))

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import {
  UnsavedChangesProvider,
  useRegisterUnsavedChanges,
  useUnsavedChanges,
} from "./unsaved-changes-provider"

function Consumer({
  dirty = true,
  onSave,
}: {
  dirty?: boolean
  onSave?: (() => Promise<boolean>) | null
}) {
  useRegisterUnsavedChanges("entry-1", dirty, onSave)
  const { confirmNavigationIfNeeded } = useUnsavedChanges()

  return (
    <div>
      <button type="button" onClick={() => void confirmNavigationIfNeeded()}>
        Confirm nav
      </button>
      <a href="/reports">Go reports</a>
    </div>
  )
}

describe("UnsavedChangesProvider", () => {
  beforeEach(() => {
    confirmMock.mockReset()
    pushMock.mockReset()
    useRouterMock.mockReturnValue({
      push: pushMock,
    })
  })

  it("confirms navigation and runs save when requested", async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(true)
    confirmMock.mockResolvedValue(true)

    render(
      <UnsavedChangesProvider>
        <Consumer onSave={onSave} />
      </UnsavedChangesProvider>,
    )

    await user.click(screen.getByRole("button", { name: "Confirm nav" }))

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalled()
    })
    expect(onSave).toHaveBeenCalled()
  })

  it("intercepts internal link navigation and routes after confirmation", async () => {
    const user = userEvent.setup()
    confirmMock.mockResolvedValue(false)

    render(
      <UnsavedChangesProvider>
        <Consumer />
      </UnsavedChangesProvider>,
    )

    await user.click(screen.getByRole("link", { name: "Go reports" }))

    await waitFor(() => {
      expect(confirmMock).toHaveBeenCalled()
    })
    expect(pushMock).toHaveBeenCalledWith("/reports")
  })

  it("registers beforeunload protection when there are unsaved changes", () => {
    const addEventListenerSpy = vi.spyOn(window, "addEventListener")

    render(
      <UnsavedChangesProvider>
        <Consumer />
      </UnsavedChangesProvider>,
    )

    expect(addEventListenerSpy).toHaveBeenCalledWith(
      "beforeunload",
      expect.any(Function),
    )
  })
})
