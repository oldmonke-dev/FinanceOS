namespace Finance.BusinessLayer.DTOs.ImportSessions
{
    public class AddImportSessionToLedgerResultDTO
    {
        public Guid SessionId { get; set; }

        public int CreatedTransactionCount { get; set; }

        public int SkippedRowCount { get; set; }

        public List<Guid> TransactionIds { get; set; } = new();

        public bool SessionArchived { get; set; }

        public string SessionStatus { get; set; } = "Active";
    }
}
