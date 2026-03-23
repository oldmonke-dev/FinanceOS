namespace Finance.WebAPI.Configuration
{
    public class CamelotOptions
    {
        public string PythonBinPath { get; set; } = "python";

        public string? ScriptPath { get; set; }
    }
}
