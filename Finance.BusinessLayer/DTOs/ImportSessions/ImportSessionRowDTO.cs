namespace Finance.BusinessLayer.DTOs.ImportSessions
{
    public class ImportSessionRowDTO
    {
        public Guid Id { get; set; }

        public int RowIndex { get; set; }

        public List<string> Values { get; set; } = new();

        public Guid? DestinationAccountId { get; set; }

        public string? DestinationAccountError { get; set; }

        public string MappingSource { get; set; } = "none";

        public DateTime? AddedToLedgerAt { get; set; }

        public Guid? PostedTransactionId { get; set; }
    }
}
