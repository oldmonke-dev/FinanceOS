namespace Finance.WebAPI.Contracts.PdfImports
{
    public class DetectedPdfTableRegion
    {
        public string Id { get; set; } = string.Empty;
        public int PageNumber { get; set; }
        public double X { get; set; }
        public double Y { get; set; }
        public double Width { get; set; }
        public double Height { get; set; }
        public string Label { get; set; } = string.Empty;
        public string Source { get; set; } = "auto";
        public double? Confidence { get; set; }
    }
}
