using Finance.Domain.Entities.Core;

namespace Finance.Domain.Entities.UserSession
{
    public class ImportSession
    {
        public Guid Id { get; set; }

        public Guid UserId { get; set; }
        public User User { get; set; } = null!;

        public string? FileName { get; set; }

        public Guid? SourceAccountId { get; set; }
        public Account? SourceAccount { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public string Label { get; set; } = "user_imports";

        public bool IsDeletable { get; set; } = true;

        public string Strategy { get; set; } = "bayesian_statistics";

        public bool HasExclusions { get; set; }

        public string ColumnMappingsJson { get; set; } = "{}";

        public bool IsArchived { get; set; }

        public string Status { get; set; } = "Active";

        public ICollection<ImportSessionRow> Rows { get; set; } = new List<ImportSessionRow>();
    }
}
