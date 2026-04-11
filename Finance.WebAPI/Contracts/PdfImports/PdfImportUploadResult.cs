namespace Finance.WebAPI.Contracts.PdfImports
{
    public class PdfImportUploadResult
    {
        public string FileId { get; set; } = string.Empty;
        public string FileName { get; set; } = string.Empty;
        public long FileSize { get; set; }
        public int PageCount { get; set; }
        public bool SupportsTextExtraction { get; set; }
        public string? WarningMessage { get; set; }
    }
}
