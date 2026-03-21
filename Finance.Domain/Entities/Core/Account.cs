using Finance.Domain.Enums;

namespace Finance.Domain.Entities.Core
{
    public class Account
    {
        public Guid Id { get; set; }

        public string Name { get; set; } = string.Empty;

        public AccountType AccountType { get; set; }

        public Guid? ParentAccountId { get; set; }
        public Account? ParentAccount { get; set; }

        public ICollection<Account> Children { get; set; } = new List<Account>();
        public ICollection<Split> Splits { get; set; } = new List<Split>();
    }
}
