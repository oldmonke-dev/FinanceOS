namespace Finance.Domain.Entities.UserSession
{
    public class OtpDeviceRegistration
    {
        public Guid UserId { get; set; }

        public string TokenHash { get; set; } = string.Empty;
        public string? ProtectedToken { get; set; }

        public DateTime CreatedAt { get; set; }

        public DateTime UpdatedAt { get; set; }
    }
}
