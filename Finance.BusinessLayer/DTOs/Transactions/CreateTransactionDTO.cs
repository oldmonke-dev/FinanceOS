namespace Finance.BusinessLayer.DTOs.Transactions
{
    public class CreateTransactionDTO
    {
        public DateTime TransactionDate { get; set; }

        public string? Description { get; set; }

        public string? ReferenceNumber { get; set; }

        public ICollection<CreateSplitDTO> Splits { get; set; } = new List<CreateSplitDTO>();
    }
}
