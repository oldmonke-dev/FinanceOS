namespace Finance.BusinessLayer.DTOs.Transactions
{
    public class UpdateTransactionDTO
    {
        public int? LedgerSequence { get; set; }

        public string? Description { get; set; }

        public string? ReferenceNumber { get; set; }

        public ICollection<UpdateSplitDTO> Splits { get; set; } = new List<UpdateSplitDTO>();
    }
}
