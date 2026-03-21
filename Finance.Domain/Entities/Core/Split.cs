namespace Finance.Domain.Entities.Core
{
    public class Split
    {
        public Guid Id { get; set; }

        public Guid TransactionId { get; set; }
        public Transaction? Transaction { get; set; }

        public Guid AccountId { get; set; }
        public Account? Account { get; set; }

        public decimal Amount { get; set; }

        public string? Memo { get; set; }
    }
}
