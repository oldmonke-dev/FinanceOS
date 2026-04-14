namespace Finance.BusinessLayer.DTOs
{
    public class AccountAccessEntryDTO
    {
        public Guid UserId { get; set; }

        public string UserDisplayName { get; set; } = string.Empty;

        public string UserEmail { get; set; } = string.Empty;

        public bool IsAdmin { get; set; }

        public bool CanView { get; set; }

        public bool CanPost { get; set; }

        public bool CanEditTransaction { get; set; }

        public bool CanDeleteTransaction { get; set; }

        public bool CanManageAccess { get; set; }
    }
}
