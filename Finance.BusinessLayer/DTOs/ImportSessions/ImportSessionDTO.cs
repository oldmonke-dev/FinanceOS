namespace Finance.BusinessLayer.DTOs.ImportSessions
{
    public class ImportSessionDTO
    {
        public Guid Id { get; set; }

        public DateTime CreatedAt { get; set; }

        public Guid UserId { get; set; }

        public string CreatedByUserName { get; set; } = string.Empty;

        public string? FileName { get; set; }

        public Guid? SourceAccountId { get; set; }

        public string? SourceAccountName { get; set; }

        public string Label { get; set; } = string.Empty;

        public bool IsDeletable { get; set; }

        public string Strategy { get; set; } = string.Empty;

        public bool HasExclusions { get; set; }

        public bool IsArchived { get; set; }

        public string Status { get; set; } = "Active";

        public Dictionary<int, string> ColumnMappings { get; set; } = new();

        public List<ImportSessionRowDTO> Rows { get; set; } = new();
    }
}
