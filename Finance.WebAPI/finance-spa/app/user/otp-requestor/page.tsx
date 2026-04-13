"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

import { AppShell } from "@/components/app-shell"
import { useAuth } from "@/components/providers/auth-provider"
import { useSnackbar } from "@/components/providers/snackbar-provider"
import { Button } from "@/components/ui/button"
import {
  createOtpRequest,
  downloadOtpTemplate,
  getOtpRequests,
  getOtpTargetUsers,
} from "@/lib/otp"
import { type OtpForwardedMessage, type OtpRequest } from "@/models/otp"
import { type User } from "@/models/user"

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
      .slice(0, 10)
  }, [requests])

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
        message: "MacroDroid template downloaded. Previous device token has been rotated.",
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

  return (
    <AppShell
      title="OTP Requestor"
      subtitle="Request secure OTP forwarding windows and download your MacroDroid template"
    >
      <div className="mx-auto grid w-full max-w-5xl gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Request Window</h2>
            <p className="text-sm text-muted-foreground">
              Each request opens a 5-minute window. Forwarded SMS is accepted only while a request is active, and message payloads are encrypted at rest on the backend.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
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
              subvalue={activeRequest?.targetEmail ?? ""}
              tone="muted"
            />
          </div>

          <label className="mt-6 block space-y-2">
            <span className="text-sm font-medium">Request OTP From</span>
            <select
              value={selectedTargetUserId}
              onChange={(event) => setSelectedTargetUserId(event.target.value)}
              className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-primary"
            >
              {targetUsers.map((targetUser) => (
                <option key={targetUser.id} value={targetUser.id}>
                  {targetUser.displayName} ({targetUser.email})
                </option>
              ))}
            </select>
          </label>

          <div className="mt-6 flex flex-wrap gap-3">
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

          <div className="mt-6 rounded-2xl border bg-background/70 p-4">
            <p className="text-sm font-medium">Workflow</p>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Download your MacroDroid template to register or rotate your device token.</li>
              <li>Select the specific user whose phone will forward the OTP SMS.</li>
              <li>Request an OTP window before starting the target login or verification flow.</li>
              <li>Forwarded SMS is accepted only during the active 5-minute window for that selected user.</li>
            </ol>
          </div>

          {isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading OTP activity...</p> : null}
        </section>

        <section className="space-y-6">
          <section className="rounded-3xl border bg-card p-6 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Template Identity</h2>
              <p className="text-sm text-muted-foreground">
                The template is tied to your current user and posts to `https://finos-staging.oldmonke.com/api-proxy/OtpRequests/ingest`.
              </p>
            </div>

            <dl className="mt-4 space-y-3 text-sm">
              <IdentityRow label="User ID" value={user?.id ?? "Unavailable"} />
              <IdentityRow label="Display Name" value={user?.displayName ?? "Unavailable"} />
              <IdentityRow label="Email" value={user?.email ?? "Unavailable"} />
            </dl>
          </section>

          <section className="rounded-3xl border bg-card p-6 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Recent Requests</h2>
              <p className="text-sm text-muted-foreground">
                Server-backed request history for your latest OTP windows.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {requests.length === 0 && !isLoading ? (
                <p className="text-sm text-muted-foreground">No OTP requests yet.</p>
              ) : (
                requests.map((item) => (
                  <div key={item.id} className="rounded-2xl border bg-background/70 p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-medium">{formatDateTime(item.requestedAt)}</div>
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${
                        item.isActive ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"
                      }`}>
                        {item.isActive ? "Active" : "Closed"}
                      </span>
                    </div>
                    <div className="mt-1 text-muted-foreground">
                      Target: {item.targetDisplayName}{item.targetEmail ? ` (${item.targetEmail})` : ""}
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
          </section>

          <section className="rounded-3xl border bg-card p-6 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Forwarded SMS</h2>
              <p className="text-sm text-muted-foreground">
                Active requests show full sender and OTP text. Closed requests fall back to masked sender details and redacted previews.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {recentMessages.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-background/50 p-4 text-sm text-muted-foreground">
                  No forwarded SMS received yet.
                </div>
              ) : (
                recentMessages.map((message) => (
                  <div key={message.id} className="rounded-2xl border bg-background/70 p-4 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{message.sender ?? message.senderMasked}</span>
                      <span className="text-xs text-muted-foreground">{formatDateTime(message.receivedAt)}</span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                      {message.message ?? message.messagePreview}
                    </p>
                  </div>
                ))
              )}
            </div>
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
    <div className="rounded-2xl border bg-background/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </p>
      <p className={`mt-2 text-lg font-semibold ${tone === "success" ? "text-emerald-700" : ""}`}>
        {value}
      </p>
      {subvalue ? <p className="mt-1 text-xs text-muted-foreground">{subvalue}</p> : null}
    </div>
  )
}

function IdentityRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b pb-3 last:border-b-0 last:pb-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
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
