namespace Finance.BusinessLayer.DTOs
{
    public class AccountDeletionResultDTO
    {
        public Guid DeletedAccountId { get; set; }

        public Guid? CreatedImportSessionId { get; set; }

        public int AffectedTransactionCount { get; set; }
    }
}
