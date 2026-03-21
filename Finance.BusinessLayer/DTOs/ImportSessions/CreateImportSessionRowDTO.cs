namespace Finance.BusinessLayer.DTOs.ImportSessions
{
    public class CreateImportSessionRowDTO
    {
        public int RowIndex { get; set; }

        public List<string> Values { get; set; } = new();

        public Guid? DestinationAccountId { get; set; }

        public string? DestinationAccountError { get; set; }

        public bool IncludeInLedger { get; set; } = true;

        public DateTime? AddedToLedgerAt { get; set; }

        public Guid? PostedTransactionId { get; set; }
    }
}
