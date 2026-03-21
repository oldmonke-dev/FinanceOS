namespace Finance.BusinessLayer.DTOs.Transactions
{
    public class SplitDTO
    {
        public Guid Id { get; set; }

        public Guid AccountId { get; set; }

        public decimal Amount { get; set; }

        public string? Memo { get; set; }
    }
}
