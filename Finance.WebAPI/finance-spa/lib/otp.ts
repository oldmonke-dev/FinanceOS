import { API_BASE_URL } from "@/lib/api-config"
import { authFetch } from "@/lib/auth"
import { type OtpRequest, type OtpTemplate } from "@/models/otp"
import { type User } from "@/models/user"

type ClearOtpDataResult = {
  deletedMessageCount: number
  deletedRequestCount: number
}

function normalizeForwardedMessage(raw: Record<string, unknown>) {
  return {
    id: String(raw.id ?? raw.Id ?? ""),
    senderMasked: String(raw.senderMasked ?? raw.SenderMasked ?? ""),
    sender:
      raw.sender == null && raw.Sender == null
        ? null
        : String(raw.sender ?? raw.Sender),
    messagePreview: String(raw.messagePreview ?? raw.MessagePreview ?? ""),
    message:
      raw.message == null && raw.Message == null
        ? null
        : String(raw.message ?? raw.Message),
    receivedAt: String(raw.receivedAt ?? raw.ReceivedAt ?? ""),
  }
}

function normalizeOtpRequest(raw: Record<string, unknown>): OtpRequest {
  const messagesSource = raw.messages ?? raw.Messages

  return {
    id: String(raw.id ?? raw.Id ?? ""),
    targetUserId: String(raw.targetUserId ?? raw.TargetUserId ?? ""),
    targetDisplayName: String(raw.targetDisplayName ?? raw.TargetDisplayName ?? ""),
    targetEmail: String(raw.targetEmail ?? raw.TargetEmail ?? ""),
    requestedAt: String(raw.requestedAt ?? raw.RequestedAt ?? ""),
    expiresAt: String(raw.expiresAt ?? raw.ExpiresAt ?? ""),
    isActive: Boolean(raw.isActive ?? raw.IsActive ?? false),
    lastForwardedAt:
      raw.lastForwardedAt == null && raw.LastForwardedAt == null
        ? null
        : String(raw.lastForwardedAt ?? raw.LastForwardedAt),
    forwardedMessageCount: Number(raw.forwardedMessageCount ?? raw.ForwardedMessageCount ?? 0),
    messages: Array.isArray(messagesSource)
      ? messagesSource.map((item) => normalizeForwardedMessage(item as Record<string, unknown>))
      : [],
  }
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const raw = (await response.json()) as { message?: string }
    return raw.message ?? fallback
  } catch {
    return fallback
  }
}

export async function getOtpRequests(): Promise<OtpRequest[]> {
  const response = await authFetch(`${API_BASE_URL}/OtpRequests`, {
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to load OTP requests: ${response.status} ${response.statusText}`),
    )
  }

  const raw = (await response.json()) as Array<Record<string, unknown>>
  return raw.map(normalizeOtpRequest)
}

export async function createOtpRequest(targetUserId: string): Promise<OtpRequest> {
  const response = await authFetch(`${API_BASE_URL}/OtpRequests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ targetUserId }),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to create OTP request: ${response.status} ${response.statusText}`),
    )
  }

  const raw = (await response.json()) as Record<string, unknown>
  return normalizeOtpRequest(raw)
}

export async function getOtpTargetUsers(): Promise<User[]> {
  const response = await authFetch(`${API_BASE_URL}/Users/options`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to load OTP target users: ${response.status} ${response.statusText}`),
    )
  }

  const raw = (await response.json()) as Array<Record<string, unknown>>
  return raw.map((item) => ({
    id: String(item.id ?? item.Id ?? ""),
    email: String(item.email ?? item.Email ?? ""),
    displayName: String(item.displayName ?? item.DisplayName ?? ""),
    isAdmin: Boolean(item.isAdmin ?? item.IsAdmin ?? false),
    isSuperUser: false,
    isActive: true,
    createdAt: "",
  }))
}

export async function downloadOtpTemplate(): Promise<OtpTemplate> {
  const response = await authFetch(`${API_BASE_URL}/OtpRequests/template`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ rotateExistingToken: false }),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to download OTP template: ${response.status} ${response.statusText}`),
    )
  }

  const raw = (await response.json()) as Record<string, unknown>

  return {
    fileName: String(raw.fileName ?? raw.FileName ?? "macrodroid-otp.json"),
    contentType: String(raw.contentType ?? raw.ContentType ?? "application/octet-stream"),
    templateJson: String(raw.templateJson ?? raw.TemplateJson ?? "{}"),
    issuedAt: String(raw.issuedAt ?? raw.IssuedAt ?? new Date().toISOString()),
  }
}

export async function clearOtpForwardedMessages(): Promise<ClearOtpDataResult> {
  const response = await authFetch(`${API_BASE_URL}/OtpRequests/messages`, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
    },
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(response, `Failed to clear OTP messages: ${response.status} ${response.statusText}`),
    )
  }

  const raw = (await response.json()) as Record<string, unknown>
  return {
    deletedMessageCount: Number(raw.deletedMessageCount ?? raw.DeletedMessageCount ?? 0),
    deletedRequestCount: Number(raw.deletedRequestCount ?? raw.DeletedRequestCount ?? 0),
  }
}
