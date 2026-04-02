namespace Finance.BusinessLayer.DTOs.Transactions
{
    public class TransactionDTO
    {
        public Guid Id { get; set; }

        public DateTime TransactionDate { get; set; }

        public int LedgerSequence { get; set; }

        public string Description { get; set; } = string.Empty;

        public string? ReferenceNumber { get; set; }

        public DateTime CreatedAt { get; set; }

        public ICollection<SplitDTO> Splits { get; set; } = new List<SplitDTO>();
    }
}
