using Finance.Domain.Enums;

namespace Finance.BusinessLayer.DTOs
{
    public class AccountListItemDTO
    {
        public Guid Id { get; set; }

        public string Name { get; set; } = string.Empty;

        public string? AccountNumber { get; set; }

        public string? Description { get; set; }

        public AccountType AccountType { get; set; }

        public Guid? ParentAccountId { get; set; }

        public decimal OpeningBalance { get; set; }

        public bool IsCore { get; set; }
        public bool IsGloballyShared { get; set; }

        public Guid? OwnerUserId { get; set; }

        public string? OwnerDisplayName { get; set; }

        public string? OwnerEmail { get; set; }

        public AccountReportingMode ReportingMode { get; set; }

        public AccountPermissionSummaryDTO CurrentUserPermissions { get; set; } = new();
    }
}
