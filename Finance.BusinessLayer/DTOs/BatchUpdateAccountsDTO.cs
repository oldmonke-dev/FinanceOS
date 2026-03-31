namespace Finance.BusinessLayer.DTOs
{
    public class BatchUpdateAccountsDTO
    {
        public List<Guid> AccountIds { get; set; } = [];

        public bool ApplyOwner { get; set; }

        public Guid? OwnerUserId { get; set; }

        public bool ApplyGlobalSharing { get; set; }

        public bool IsGloballyShared { get; set; }

        public bool ApplyMove { get; set; }

        public Guid? ParentAccountId { get; set; }
    }
}
