namespace Finance.WebAPI.Contracts.PdfImports
{
    public class DetectPdfTablesResult
    {
        public string FileId { get; set; } = string.Empty;
        public int PageCount { get; set; }
        public bool SupportsTextExtraction { get; set; }
        public string? WarningMessage { get; set; }
        public List<DetectedPdfTableRegion> Regions { get; set; } = [];
    }
}
