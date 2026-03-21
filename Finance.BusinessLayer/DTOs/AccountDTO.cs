using Finance.Domain.Enums;

namespace Finance.BusinessLayer.DTOs
{
    public class AccountDTO
    {
        public Guid Id { get; set; }

        public string? Name { get; set; }

        public AccountType? AccountType { get; set; }

        public Guid? ParentAccountId { get; set; }

        public ICollection<AccountDTO> Children { get; set; } = new List<AccountDTO>();
    }
}
