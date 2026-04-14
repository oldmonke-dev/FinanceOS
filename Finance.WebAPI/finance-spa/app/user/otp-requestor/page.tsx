"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { AppShell } from "@/components/app-shell"
import { useAuth } from "@/components/providers/auth-provider"
import { useSnackbar } from "@/components/providers/snackbar-provider"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createOtpRequest,
  downloadOtpTemplate,
  getOtpRequests,
  getOtpTargetUsers,
} from "@/lib/otp"
import { type OtpForwardedMessage, type OtpRequest } from "@/models/otp"
import { type User } from "@/models/user"

const PAGE_SIZE = 5

export default function OtpRequestorPage() {
  const { user } = useAuth()
  const { showSnackbar } = useSnackbar()
  const [requests, setRequests] = useState<OtpRequest[]>([])
  const [targetUsers, setTargetUsers] = useState<User[]>([])
  const [selectedTargetUserId, setSelectedTargetUserId] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isRequesting, setIsRequesting] = useState(false)
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const [requestPage, setRequestPage] = useState(1)
  const [messagePage, setMessagePage] = useState(1)

  const activeRequest = useMemo(() => {
    return requests.find((item) => item.isActive && new Date(item.expiresAt).getTime() > now) ?? null
  }, [now, requests])

  const recentMessages = useMemo(() => {
    const seen = new Set<string>()
    const flattened: OtpForwardedMessage[] = []

    for (const request of requests) {
      for (const message of request.messages) {
        if (seen.has(message.id)) {
          continue
        }

        seen.add(message.id)
        flattened.push(message)
      }
    }

    return flattened
      .sort((left, right) => new Date(right.receivedAt).getTime() - new Date(left.receivedAt).getTime())
  }, [requests])

  const pagedRequests = useMemo(() => {
    const startIndex = (requestPage - 1) * PAGE_SIZE
    return requests.slice(startIndex, startIndex + PAGE_SIZE)
  }, [requestPage, requests])

  const pagedMessages = useMemo(() => {
    const startIndex = (messagePage - 1) * PAGE_SIZE
    return recentMessages.slice(startIndex, startIndex + PAGE_SIZE)
  }, [messagePage, recentMessages])

  const requestPageCount = Math.max(1, Math.ceil(requests.length / PAGE_SIZE))
  const messagePageCount = Math.max(1, Math.ceil(recentMessages.length / PAGE_SIZE))

  const loadRequests = useCallback(async (showErrors = true) => {
    try {
      if (showErrors) {
        setIsLoading(true)
      }

      const [nextRequests, nextUsers] = await Promise.all([getOtpRequests(), getOtpTargetUsers()])
      setRequests(nextRequests)
      setTargetUsers(nextUsers)
      setSelectedTargetUserId((current) =>
        current || nextUsers[0]?.id || "",
      )
      setRequestPage(1)
      setMessagePage(1)
    } catch (error) {
      if (showErrors) {
        showSnackbar({
          message: error instanceof Error ? error.message : "Failed to load OTP requests.",
          tone: "error",
        })
      }
    } finally {
      if (showErrors) {
        setIsLoading(false)
      }
    }
  }, [showSnackbar])

  useEffect(() => {
    void loadRequests()
  }, [loadRequests])

  useEffect(() => {
    if (!activeRequest) {
      return
    }

    const tickId = window.setInterval(() => {
      setNow(Date.now())
    }, 1000)

    const pollId = window.setInterval(() => {
      void loadRequests(false)
    }, 5000)

    return () => {
      window.clearInterval(tickId)
      window.clearInterval(pollId)
    }
  }, [activeRequest, loadRequests])

  const remainingMs = activeRequest == null
    ? 0
    : Math.max(new Date(activeRequest.expiresAt).getTime() - now, 0)

  async function handleRequestOtp() {
    setIsRequesting(true)

    try {
      const createdRequest = await createOtpRequest(selectedTargetUserId)
      setNow(Date.now())
      setRequests((current) => [createdRequest, ...current.filter((item) => item.id !== createdRequest.id)])
      showSnackbar({
        message: "OTP forwarding window opened for 5 minutes.",
        tone: "success",
      })
      await loadRequests(false)
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to request OTP window.",
        tone: "error",
      })
    } finally {
      setIsRequesting(false)
    }
  }

  async function handleDownloadTemplate() {
    setIsDownloadingTemplate(true)

    try {
      const template = await downloadOtpTemplate()
      const blob = new Blob([template.templateJson], { type: template.contentType })
      const objectUrl = window.URL.createObjectURL(blob)
      const link = document.createElement("a")
      const normalizedFileName = template.fileName.endsWith(".macro")
        ? template.fileName
        : `${template.fileName.replace(/\.json$/i, "")}.macro`
      link.href = objectUrl
      link.download = normalizedFileName
      document.body.append(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(objectUrl)

      showSnackbar({
        message: "MacroDroid template downloaded.",
        tone: "success",
      })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to download MacroDroid template.",
        tone: "error",
      })
    } finally {
      setIsDownloadingTemplate(false)
    }
  }

  async function handleCopyMessage(message: OtpForwardedMessage) {
    const value = message.message ?? message.messagePreview

    try {
      await navigator.clipboard.writeText(value)
      showSnackbar({
        message: "Message copied.",
        tone: "success",
      })
    } catch {
      showSnackbar({
        message: "Failed to copy message.",
        tone: "error",
      })
    }
  }

  async function handleCopyOtp(message: OtpForwardedMessage) {
    const otp = extractOtpFromMessage(message.message ?? message.messagePreview)

    if (!otp) {
      showSnackbar({
        message: "No OTP detected in this message.",
        tone: "error",
      })
      return
    }

    try {
      await navigator.clipboard.writeText(otp)
      showSnackbar({
        message: `OTP copied: ${otp}`,
        tone: "success",
      })
    } catch {
      showSnackbar({
        message: "Failed to copy OTP.",
        tone: "error",
      })
    }
  }

  return (
    <AppShell
      title="OTP Requestor"
      subtitle="Request secure OTP forwarding windows and download your MacroDroid template"
    >
      <div className="mx-auto grid w-full max-w-7xl gap-4 xl:grid-cols-3">
        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Request Window</h2>
            <p className="text-sm text-muted-foreground">
              Each request opens a 5-minute window for the selected target user.
            </p>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <StatusCard
              label="Status"
              value={activeRequest ? "Active" : "Idle"}
              tone={activeRequest ? "success" : "muted"}
            />
            <StatusCard
              label="Time Remaining"
              value={activeRequest ? formatRemaining(remainingMs) : "00:00"}
              tone={activeRequest ? "success" : "muted"}
            />
            <StatusCard
              label="Target User"
              value={activeRequest?.targetDisplayName ?? "Not selected"}
              tone="muted"
            />
          </div>

          <label className="mt-4 block space-y-2">
            <span className="text-sm font-medium">Request OTP From</span>
            <Select
              value={selectedTargetUserId}
              onValueChange={setSelectedTargetUserId}
              disabled={targetUsers.length === 0}
            >
              <SelectTrigger className="h-10 w-full rounded-xl px-3">
                <SelectValue placeholder={isLoading ? "Loading users..." : "Select a target user"} />
              </SelectTrigger>
              <SelectContent>
                {targetUsers.map((targetUser) => (
                  <SelectItem key={targetUser.id} value={targetUser.id}>
                    {targetUser.displayName} ({targetUser.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => void handleRequestOtp()}
              disabled={isRequesting || !selectedTargetUserId}
            >
              {isRequesting
                ? "Opening..."
                : activeRequest
                  ? "Restart 5-minute window"
                  : "Request OTP"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleDownloadTemplate()}
              disabled={isDownloadingTemplate}
            >
              {isDownloadingTemplate ? "Preparing..." : "Download MacroDroid Template"}
            </Button>
          </div>

          <div className="mt-4 rounded-2xl border bg-background/70 p-3">
            <p className="text-sm font-medium">Workflow</p>
            <div className="mt-2 space-y-1 text-sm text-muted-foreground">
              <p>1. Download template.</p>
              <p>2. Select target user.</p>
              <p>3. Open 5-minute window.</p>
              <p>4. Receive forwarded SMS.</p>
            </div>
          </div>

          {isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading OTP activity...</p> : null}
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-sm">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Forwarded SMS</h2>
            <p className="text-sm text-muted-foreground">
              Active requests show full sender and OTP text.
            </p>
          </div>

          <div className="mt-3 space-y-2.5">
            {recentMessages.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-background/50 p-3 text-sm text-muted-foreground">
                No forwarded SMS received yet.
              </div>
            ) : (
              pagedMessages.map((message) => (
                <div key={message.id} className="rounded-2xl border bg-background/70 p-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{message.sender ?? message.senderMasked}</span>
                    <span className="text-xs text-muted-foreground">{formatDateTime(message.receivedAt)}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-muted-foreground">
                    {message.message ?? message.messagePreview}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopyMessage(message)}
                    >
                      Copy Message
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void handleCopyOtp(message)}
                      disabled={!extractOtpFromMessage(message.message ?? message.messagePreview)}
                    >
                      {formatCopyOtpLabel(message)}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
          {recentMessages.length > PAGE_SIZE ? (
            <PaginationControls
              page={messagePage}
              pageCount={messagePageCount}
              onPrevious={() => setMessagePage((current) => Math.max(1, current - 1))}
              onNext={() => setMessagePage((current) => Math.min(messagePageCount, current + 1))}
            />
          ) : null}
        </section>

        <section className="space-y-4">
          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Template Identity</h2>
              <p className="text-sm text-muted-foreground">
                Template is tied to your current user.
              </p>
            </div>

            <dl className="mt-3 space-y-2 text-sm">
              <IdentityRow label="User ID" value={user?.id ?? "Unavailable"} />
              <IdentityRow label="Display Name" value={user?.displayName ?? "Unavailable"} />
              <IdentityRow label="Email" value={user?.email ?? "Unavailable"} />
            </dl>
          </section>

          <section className="rounded-3xl border bg-card p-5 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Recent Requests</h2>
              <p className="text-sm text-muted-foreground">
                Latest OTP windows.
              </p>
            </div>

            <div className="mt-3 space-y-2.5">
              {requests.length === 0 && !isLoading ? (
                <p className="text-sm text-muted-foreground">No OTP requests yet.</p>
              ) : (
                pagedRequests.map((item) => (
                  <div key={item.id} className="rounded-2xl border bg-background/70 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{formatDateTime(item.requestedAt)}</div>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        item.isActive ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"
                      }`}>
                        {item.isActive ? "Active" : "Closed"}
                      </span>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      Target User: {item.targetDisplayName}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      Expires at {formatDateTime(item.expiresAt)}
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      Forwarded SMS: {item.forwardedMessageCount}
                    </div>
                  </div>
                ))
              )}
            </div>
            {requests.length > PAGE_SIZE ? (
              <PaginationControls
                page={requestPage}
                pageCount={requestPageCount}
                onPrevious={() => setRequestPage((current) => Math.max(1, current - 1))}
                onNext={() => setRequestPage((current) => Math.min(requestPageCount, current + 1))}
              />
            ) : null}
          </section>
        </section>
      </div>
    </AppShell>
  )
}

function StatusCard({
  label,
  value,
  subvalue,
  tone,
}: {
  label: string
  value: string
  subvalue?: string
  tone: "success" | "muted"
}) {
  return (
    <div className="rounded-2xl border bg-background/70 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1.5 text-base font-semibold ${tone === "success" ? "text-emerald-700" : ""}`}>
        {value}
      </p>
      {subvalue ? <p className="mt-1 text-xs text-muted-foreground">{subvalue}</p> : null}
    </div>
  )
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-2 last:border-b-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}

function PaginationControls({
  page,
  pageCount,
  onPrevious,
  onNext,
}: {
  page: number
  pageCount: number
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 text-sm">
      <Button type="button" variant="outline" size="sm" onClick={onPrevious} disabled={page <= 1}>
        Previous
      </Button>
      <span className="text-muted-foreground">
        Page {page} of {pageCount}
      </span>
      <Button type="button" variant="outline" size="sm" onClick={onNext} disabled={page >= pageCount}>
        Next
      </Button>
    </div>
  )
}

function formatRemaining(remainingMs: number) {
  const totalSeconds = Math.ceil(remainingMs / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
}

function formatDateTime(value: string) {
  const date = new Date(value)

  return date.toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  })
}

function extractOtpFromMessage(message: string) {
  const prioritizedPatterns = [
    /\b(?:otp|code|passcode|verification code|one[- ]time password)[^\d]{0,20}(\d{4,8})\b/i,
    /\b(\d{6})\b/,
    /\b(\d{4,8})\b/,
  ]

  for (const pattern of prioritizedPatterns) {
    const match = message.match(pattern)
    if (match?.[1]) {
      return match[1]
    }
  }

  return null
}

function formatCopyOtpLabel(message: OtpForwardedMessage) {
  const otp = extractOtpFromMessage(message.message ?? message.messagePreview)
  return otp ? `Copy OTP '${otp}'` : "Copy OTP"
}
