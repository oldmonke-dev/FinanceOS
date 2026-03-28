using Finance.Domain.Enums;

namespace Finance.BusinessLayer.DTOs.Transactions
{
    public class CreateSplitDTO
    {
        public Guid AccountId { get; set; }

        public decimal Amount { get; set; }

        public SplitSide Side { get; set; }

        public string? Memo { get; set; }
    }
}
