using Finance.Domain.Enums;

namespace Finance.BusinessLayer.DTOs
{
    public class UpdateAccountPermissionsDTO
    {
        public Guid? OwnerUserId { get; set; }
        public bool IsGloballyShared { get; set; }

        public AccountReportingMode ReportingMode { get; set; }

        public List<UpdateAccountAccessEntryDTO> Entries { get; set; } = [];
    }
}
