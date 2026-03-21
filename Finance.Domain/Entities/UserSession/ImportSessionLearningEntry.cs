using Finance.Domain.Entities.Core;

namespace Finance.Domain.Entities.UserSession
{
    public class ImportSessionLearningEntry
    {
        public Guid Id { get; set; }

        public Guid ImportSessionId { get; set; }
        public ImportSession ImportSession { get; set; } = null!;

        public Guid ImportSessionRowId { get; set; }
        public ImportSessionRow ImportSessionRow { get; set; } = null!;

        public Guid DestinationAccountId { get; set; }
        public Account DestinationAccount { get; set; } = null!;

        public string FeatureKey { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
