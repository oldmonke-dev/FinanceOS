using Finance.Domain.Enums;

namespace Finance.BusinessLayer.DTOs
{
    public class AccountAccessDetailsDTO
    {
        public Guid AccountId { get; set; }

        public string AccountName { get; set; } = string.Empty;

        public Guid? OwnerUserId { get; set; }

        public string? OwnerDisplayName { get; set; }

        public string? OwnerEmail { get; set; }

        public bool IsGloballyShared { get; set; }

        public AccountReportingMode ReportingMode { get; set; }

        public AccountPermissionSummaryDTO CurrentUserPermissions { get; set; } = new();

        public List<AccountAccessEntryDTO> Entries { get; set; } = [];

        public List<UserOptionDTO> AvailableUsers { get; set; } = [];
    }
}
