namespace Finance.WebAPI.Contracts.Imports
{
    public class ExtractPdfImportResult
    {
        public string FileName { get; set; } = string.Empty;

        public string CsvText { get; set; } = string.Empty;

        public string Delimiter { get; set; } = ",";

        public string Message { get; set; } = "PDF extracted successfully.";
    }
}
