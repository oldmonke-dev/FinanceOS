namespace Finance.BusinessLayer.DTOs
{
    public class UpdateAccountAccessEntryDTO
    {
        public Guid UserId { get; set; }

        public bool CanView { get; set; }

        public bool CanPost { get; set; }

        public bool CanEditTransaction { get; set; }

        public bool CanDeleteTransaction { get; set; }

        public bool CanManageAccess { get; set; }
    }
}
