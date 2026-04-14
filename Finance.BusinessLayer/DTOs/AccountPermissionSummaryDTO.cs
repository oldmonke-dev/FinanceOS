namespace Finance.BusinessLayer.DTOs
{
    public class AccountPermissionSummaryDTO
    {
        public bool CanView { get; set; }

        public bool CanPost { get; set; }

        public bool CanEditTransaction { get; set; }

        public bool CanDeleteTransaction { get; set; }

        public bool CanManageAccess { get; set; }

        public bool CanChangeOwner { get; set; }

        public bool IsOwner { get; set; }
    }
}
