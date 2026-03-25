using Finance.Domain.Enums;

namespace Finance.BusinessLayer.DTOs
{
    public class AccountListItemDTO
    {
        public Guid Id { get; set; }

        public string Name { get; set; } = string.Empty;

        public AccountType AccountType { get; set; }

        public Guid? ParentAccountId { get; set; }

        public decimal OpeningBalance { get; set; }

        public Guid? OwnerUserId { get; set; }

        public string? OwnerDisplayName { get; set; }

        public string? OwnerEmail { get; set; }
    }
}
