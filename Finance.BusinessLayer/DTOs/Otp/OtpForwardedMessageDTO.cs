namespace Finance.BusinessLayer.DTOs.Otp
{
    public class OtpForwardedMessageDTO
    {
        public Guid Id { get; set; }

        public string SenderMasked { get; set; } = string.Empty;

        public string MessagePreview { get; set; } = string.Empty;

        public DateTime ReceivedAt { get; set; }
    }
}
