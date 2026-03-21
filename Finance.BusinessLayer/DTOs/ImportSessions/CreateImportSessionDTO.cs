namespace Finance.BusinessLayer.DTOs.ImportSessions
{
    public class CreateImportSessionDTO
    {
        public string? FileName { get; set; }

        public Guid? SourceAccountId { get; set; }

        public string Label { get; set; } = "user_imports";

        public string Strategy { get; set; } = "bayesian_statistics";

        public bool HasExclusions { get; set; }

        public bool IsArchived { get; set; }

        public string Status { get; set; } = "Active";

        public Dictionary<int, string> ColumnMappings { get; set; } = new();

        public List<CreateImportSessionRowDTO> Rows { get; set; } = new();
    }
}
