namespace Finance.BusinessLayer.DTOs.Users
{
    public class UserDTO
    {
        public Guid Id { get; set; }

        public string Email { get; set; } = string.Empty;

        public string DisplayName { get; set; } = string.Empty;

        public bool IsAdmin { get; set; }

        public bool IsSuperUser { get; set; }

        public bool IsActive { get; set; }

        public DateTime CreatedAt { get; set; }
    }
}
