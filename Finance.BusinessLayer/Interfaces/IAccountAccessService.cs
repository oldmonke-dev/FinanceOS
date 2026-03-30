using Finance.BusinessLayer.DTOs;
using Finance.Domain.Entities.Core;

namespace Finance.BusinessLayer.Interfaces
{
    public interface IAccountAccessService
    {
        Task<Dictionary<Guid, AccountPermissionSummaryDTO>> GetCurrentUserPermissionsAsync(
            IEnumerable<Guid> accountIds,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default);

        Task<HashSet<Guid>> GetViewableAccountIdsAsync(
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default);

        Task<HashSet<Guid>> GetPostableAccountIdsAsync(
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default);

        Task EnsureCanViewAccountAsync(
            Guid accountId,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default);

        Task EnsureCanManageAccountAsync(
            Guid accountId,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default);

        Task EnsureCanPostAccountsAsync(
            IEnumerable<Guid> accountIds,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default);

        Task EnsureCanEditTransactionAsync(
            Transaction transaction,
            IEnumerable<Guid> nextAccountIds,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default);

        Task EnsureCanDeleteTransactionAsync(
            Transaction transaction,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default);
    }
}
