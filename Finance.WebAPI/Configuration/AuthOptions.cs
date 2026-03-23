namespace Finance.WebAPI.Configuration
{
    public class AuthOptions
    {
        public string Issuer { get; set; } = "Finance.WebAPI";

        public string Audience { get; set; } = "Finance.WebAPI.SPA";

        public string JwtSecret { get; set; } = string.Empty;

        public int TokenLifetimeMinutes { get; set; } = 480;

        public List<BootstrapUserOptions> BootstrapUsers { get; set; } = [];
    }

    public class BootstrapUserOptions
    {
        public string Email { get; set; } = string.Empty;

        public string Password { get; set; } = string.Empty;
    }
}
