namespace Finance.BusinessLayer.DTOs.Users
{
    public class CreateUserDTO
    {
        public string Email { get; set; } = string.Empty;

        public string DisplayName { get; set; } = string.Empty;

        public string Password { get; set; } = string.Empty;

        public bool IsAdmin { get; set; }
    }
}
