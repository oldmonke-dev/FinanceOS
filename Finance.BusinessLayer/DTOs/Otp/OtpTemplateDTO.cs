namespace Finance.BusinessLayer.DTOs.Otp
{
    public class OtpTemplateDTO
    {
        public string FileName { get; set; } = string.Empty;

        public string ContentType { get; set; } = "application/json";

        public string TemplateJson { get; set; } = string.Empty;

        public DateTime IssuedAt { get; set; }
    }
}
