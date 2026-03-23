namespace Finance.WebAPI.Configuration
{
    public class TabulaOptions
    {
        public string JavaBinPath { get; set; } = "java";

        public string JarPath { get; set; } = "/opt/tabula/tabula.jar";

        public string Pages { get; set; } = "all";

        public string Format { get; set; } = "CSV";

        public bool Guess { get; set; } = true;

        public string ExtractionMode { get; set; } = "stream";
    }
}
