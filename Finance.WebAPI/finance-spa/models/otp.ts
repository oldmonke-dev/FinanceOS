export type OtpForwardedMessage = {
  id: string
  senderMasked: string
  messagePreview: string
  receivedAt: string
}

export type OtpRequest = {
  id: string
  targetUserId: string
  targetDisplayName: string
  targetEmail: string
  requestedAt: string
  expiresAt: string
  isActive: boolean
  lastForwardedAt: string | null
  forwardedMessageCount: number
  messages: OtpForwardedMessage[]
}

export type OtpTemplate = {
  fileName: string
  contentType: string
  templateJson: string
  issuedAt: string
}
