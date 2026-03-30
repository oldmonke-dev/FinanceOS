namespace Finance.Domain.Entities.Core
{
    public class AccountAccess
    {
        public Guid Id { get; set; }

        public Guid AccountId { get; set; }
        public Account? Account { get; set; }

        public Guid UserId { get; set; }
        public User? User { get; set; }

        public bool CanView { get; set; }

        public bool CanPost { get; set; }

        public bool CanEditTransaction { get; set; }

        public bool CanDeleteTransaction { get; set; }

        public bool CanManageAccess { get; set; }
    }
}
