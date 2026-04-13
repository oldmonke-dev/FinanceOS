namespace Finance.BusinessLayer.DTOs.Otp
{
    public class OtpRequestDTO
    {
        public Guid Id { get; set; }

        public Guid TargetUserId { get; set; }

        public string TargetDisplayName { get; set; } = string.Empty;

        public string TargetEmail { get; set; } = string.Empty;

        public DateTime RequestedAt { get; set; }

        public DateTime ExpiresAt { get; set; }

        public bool IsActive { get; set; }

        public DateTime? LastForwardedAt { get; set; }

        public int ForwardedMessageCount { get; set; }

        public List<OtpForwardedMessageDTO> Messages { get; set; } = [];
    }
}
