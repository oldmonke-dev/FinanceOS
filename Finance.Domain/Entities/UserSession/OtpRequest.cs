namespace Finance.Domain.Entities.UserSession
{
    public class OtpRequest
    {
        public Guid Id { get; set; }

        public Guid UserId { get; set; }

        public Guid TargetUserId { get; set; }

        public DateTime RequestedAt { get; set; }

        public DateTime ExpiresAt { get; set; }

        public DateTime? ClosedAt { get; set; }

        public DateTime? LastForwardedAt { get; set; }

        public ICollection<OtpForwardedMessage> Messages { get; set; } = new List<OtpForwardedMessage>();
    }
}
