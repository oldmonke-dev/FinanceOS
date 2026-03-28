using Finance.Domain.Enums;

namespace Finance.Domain.Entities.Core
{
    public class Split
    {
        public Guid Id { get; set; }

        public Guid TransactionId { get; set; }
        public Transaction? Transaction { get; set; }

        public Guid AccountId { get; set; }
        public Account? Account { get; set; }

        // The absolute posting amount. Debit/credit meaning is carried by Side.
        public decimal Amount { get; set; }

        public SplitSide Side { get; set; }

        public string? Memo { get; set; }
    }
}
