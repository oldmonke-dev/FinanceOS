namespace Finance.BusinessLayer.DTOs.Otp
{
    public class IngestOtpMessageDTO
    {
        public string Sender { get; set; } = string.Empty;

        public string Message { get; set; } = string.Empty;

        public DateTime? ReceivedAt { get; set; }
    }
}
