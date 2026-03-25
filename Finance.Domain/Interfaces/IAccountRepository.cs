using Finance.Domain.Entities.Core;

namespace Finance.Domain.Interfaces
{
    public interface IAccountRepository
    {
        Task<List<Account>> GetAllAccountsAsync(Guid userId, bool isAdmin);

        Task<HashSet<Guid>> GetExistingAccountIdsAsync(IEnumerable<Guid> accountIds, CancellationToken cancellationToken = default);
    }
}
