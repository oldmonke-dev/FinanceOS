namespace Finance.BusinessLayer.DTOs.Auth
{
    public class LoginResponseDTO
    {
        public string AccessToken { get; set; } = string.Empty;

        public DateTime ExpiresAt { get; set; }

        public AuthenticatedUserDTO User { get; set; } = new();
    }
}
