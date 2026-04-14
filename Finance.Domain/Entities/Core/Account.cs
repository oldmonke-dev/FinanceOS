using Finance.Domain.Enums;

namespace Finance.Domain.Entities.Core
{
    public class Account
    {
        public Guid Id { get; set; }

        public string Name { get; set; } = string.Empty;

        public string? AccountNumber { get; set; }

        public string? Description { get; set; }

        public AccountType AccountType { get; set; }

        public decimal OpeningBalance { get; set; }

        public bool IsCore { get; set; }
        public bool IsGloballyShared { get; set; }

        public Guid? OwnerUserId { get; set; }
        public User? OwnerUser { get; set; }

        public AccountReportingMode ReportingMode { get; set; } = AccountReportingMode.Included;

        public Guid? ParentAccountId { get; set; }
        public Account? ParentAccount { get; set; }

        public ICollection<Account> Children { get; set; } = new List<Account>();
        public ICollection<AccountAccess> AccessEntries { get; set; } = new List<AccountAccess>();
        public ICollection<Split> Splits { get; set; } = new List<Split>();
    }
}
