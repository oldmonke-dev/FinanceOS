namespace Finance.Domain.Entities.UserSession
{
    public class OtpForwardedMessage
    {
        public Guid Id { get; set; }

        public Guid OtpRequestId { get; set; }

        public Guid UserId { get; set; }

        public string SenderMasked { get; set; } = string.Empty;

        public string SenderEncrypted { get; set; } = string.Empty;

        public string MessagePreview { get; set; } = string.Empty;

        public string MessageEncrypted { get; set; } = string.Empty;

        public DateTime ReceivedAt { get; set; }

        public DateTime CreatedAt { get; set; }

        public OtpRequest? OtpRequest { get; set; }
    }
}
