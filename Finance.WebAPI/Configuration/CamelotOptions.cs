namespace Finance.WebAPI.Configuration
{
    public class CamelotOptions
    {
        public string PythonBinPath { get; set; } = "python";
        public string ScriptPath { get; set; } = "Scripts/detect_tables.py";
        public string WorkingDirectory { get; set; } = string.Empty;
    }
}
