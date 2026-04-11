namespace Finance.WebAPI.Contracts.PdfImports
{
    public class DetectPdfTablesRequest
    {
        public string FileId { get; set; } = string.Empty;
        public string Flavor { get; set; } = "lattice";
        public string Pages { get; set; } = "1";
        public string? LineScale { get; set; }
        public string? EdgeTolerance { get; set; }
        public string? RowTolerance { get; set; }
        public string? ColumnTolerance { get; set; }
        public bool SplitText { get; set; } = true;
        public bool StripText { get; set; } = true;
    }
}
