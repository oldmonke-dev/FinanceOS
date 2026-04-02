namespace Finance.Domain.Entities.Core
{
    public class Transaction
    {
        public Guid Id { get; set; }

        public DateTime TransactionDate { get; set; }

        public int LedgerSequence { get; set; }

        public string Description { get; set; } = string.Empty;

        public string? ReferenceNumber { get; set; }

        public DateTime CreatedAt { get; set; }

        public ICollection<Split> Splits { get; set; } = new List<Split>();
    }
}
