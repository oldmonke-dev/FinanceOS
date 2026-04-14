namespace Finance.WebAPI.Configuration
{
    public class OtpOptions
    {
        public string FrontendBaseUrl { get; set; } = string.Empty;

        public string IngestBaseUrl { get; set; } = string.Empty;

        public int ActiveWindowMinutes { get; set; } = 5;

        public int RequestHistoryLimit { get; set; } = 20;
    }
}
