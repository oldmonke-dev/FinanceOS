namespace Finance.WebAPI.Configuration
{
    public class CamelotWorkerOptions
    {
        public string BaseUrl { get; set; } = "http://localhost:8000";

        public int TimeoutSeconds { get; set; } = 60;
    }
}
