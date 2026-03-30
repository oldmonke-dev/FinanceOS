namespace Finance.BusinessLayer.DTOs
{
    public class UserOptionDTO
    {
        public Guid Id { get; set; }

        public string DisplayName { get; set; } = string.Empty;

        public string Email { get; set; } = string.Empty;

        public bool IsAdmin { get; set; }
    }
}
