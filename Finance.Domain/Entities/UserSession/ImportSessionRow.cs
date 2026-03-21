using Finance.Domain.Entities.Core;

namespace Finance.Domain.Entities.UserSession
{
    public class ImportSessionRow
    {
        public Guid Id { get; set; }

        public Guid ImportSessionId { get; set; }
        public ImportSession ImportSession { get; set; } = null!;

        public int RowIndex { get; set; }

        public string ValuesJson { get; set; } = "[]";

        public Guid? DestinationAccountId { get; set; }
        public Account? DestinationAccount { get; set; }

        public string? DestinationAccountError { get; set; }

        public string MappingSource { get; set; } = "none";

        public bool IncludeInLedger { get; set; } = true;

        public DateTime? AddedToLedgerAt { get; set; }

        public Guid? PostedTransactionId { get; set; }

        public ICollection<ImportSessionLearningEntry> LearningEntries { get; set; } = new List<ImportSessionLearningEntry>();
    }
}
