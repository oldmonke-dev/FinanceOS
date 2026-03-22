namespace Finance.Domain.Entities.Core
{
    public class User
    {
        public Guid Id { get; set; }

        public string Email { get; set; } = string.Empty;

        public string DisplayName { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; }

        public DateTime? LastSeenAt { get; set; }

        public UserPreference? Preference { get; set; }
    }
}
