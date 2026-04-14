namespace Finance.BusinessLayer.DTOs.Otp
{
    public class OtpForwardedMessageDTO
    {
        public Guid Id { get; set; }

        public string SenderMasked { get; set; } = string.Empty;

        public string? Sender { get; set; }

        public string MessagePreview { get; set; } = string.Empty;

        public string? Message { get; set; }

        public DateTime ReceivedAt { get; set; }
    }
}
