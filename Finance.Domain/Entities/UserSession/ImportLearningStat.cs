using Finance.Domain.Entities.Core;

namespace Finance.Domain.Entities.UserSession
{
    public class ImportLearningStat
    {
        public Guid Id { get; set; }

        public Guid UserId { get; set; }
        public User User { get; set; } = null!;

        public Guid DestinationAccountId { get; set; }
        public Account DestinationAccount { get; set; } = null!;

        public string FeatureKey { get; set; } = string.Empty;

        public int Count { get; set; }
    }
}
