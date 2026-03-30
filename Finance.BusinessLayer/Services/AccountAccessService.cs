using Finance.BusinessLayer.DTOs;
using Finance.BusinessLayer.Interfaces;
using Finance.Domain.Entities.Core;
using Microsoft.EntityFrameworkCore;

namespace Finance.BusinessLayer.Services
{
    public class AccountAccessService : IAccountAccessService
    {
        private enum PermissionKind
        {
            View,
            Post,
            EditTransaction,
            DeleteTransaction,
            ManageAccess,
        }

        private readonly IAppDbContext _context;

        public AccountAccessService(IAppDbContext context)
        {
            _context = context;
        }

        public async Task<Dictionary<Guid, AccountPermissionSummaryDTO>> GetCurrentUserPermissionsAsync(
            IEnumerable<Guid> accountIds,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default)
        {
            var requestedAccountIds = accountIds
                .Where(accountId => accountId != Guid.Empty)
                .Distinct()
                .ToArray();

            if (requestedAccountIds.Length == 0)
            {
                return new Dictionary<Guid, AccountPermissionSummaryDTO>();
            }

            var accounts = await _context.Accounts
                .Include(account => account.AccessEntries)
                .Where(account => requestedAccountIds.Contains(account.Id))
                .ToListAsync(cancellationToken);

            return accounts.ToDictionary(
                account => account.Id,
                account => ResolvePermissions(account, userId, isAdmin));
        }

        public async Task<HashSet<Guid>> GetViewableAccountIdsAsync(
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default)
        {
            return await GetAccessibleAccountIdsByPermissionAsync(
                userId,
                isAdmin,
                PermissionKind.View,
                cancellationToken);
        }

        public async Task<HashSet<Guid>> GetPostableAccountIdsAsync(
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default)
        {
            return await GetAccessibleAccountIdsByPermissionAsync(
                userId,
                isAdmin,
                PermissionKind.Post,
                cancellationToken);
        }

        public async Task EnsureCanViewAccountAsync(
            Guid accountId,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default)
        {
            await EnsurePermissionAsync(
                new[] { accountId },
                userId,
                isAdmin,
                PermissionKind.View,
                "You do not have permission to view that account.",
                cancellationToken);
        }

        public async Task EnsureCanManageAccountAsync(
            Guid accountId,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default)
        {
            await EnsurePermissionAsync(
                new[] { accountId },
                userId,
                isAdmin,
                PermissionKind.ManageAccess,
                "You do not have permission to manage that account.",
                cancellationToken);
        }

        public async Task EnsureCanPostAccountsAsync(
            IEnumerable<Guid> accountIds,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default)
        {
            await EnsurePermissionAsync(
                accountIds,
                userId,
                isAdmin,
                PermissionKind.Post,
                "You do not have permission to post transactions to one or more selected accounts.",
                cancellationToken);
        }

        public async Task EnsureCanEditTransactionAsync(
            Transaction transaction,
            IEnumerable<Guid> nextAccountIds,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default)
        {
            var existingAccountIds = transaction.Splits
                .Select(split => split.AccountId);

            await EnsurePermissionAsync(
                existingAccountIds.Concat(nextAccountIds),
                userId,
                isAdmin,
                PermissionKind.EditTransaction,
                "You do not have permission to edit that transaction.",
                cancellationToken);
        }

        public async Task EnsureCanDeleteTransactionAsync(
            Transaction transaction,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default)
        {
            await EnsurePermissionAsync(
                transaction.Splits.Select(split => split.AccountId),
                userId,
                isAdmin,
                PermissionKind.DeleteTransaction,
                "You do not have permission to delete that transaction.",
                cancellationToken);
        }

        private async Task<HashSet<Guid>> GetAccessibleAccountIdsByPermissionAsync(
            Guid userId,
            bool isAdmin,
            PermissionKind permissionKind,
            CancellationToken cancellationToken)
        {
            var accounts = await _context.Accounts
                .Include(account => account.AccessEntries)
                .ToListAsync(cancellationToken);

            return accounts
                .Where(account => HasPermission(ResolvePermissions(account, userId, isAdmin), permissionKind))
                .Select(account => account.Id)
                .ToHashSet();
        }

        private async Task EnsurePermissionAsync(
            IEnumerable<Guid> accountIds,
            Guid userId,
            bool isAdmin,
            PermissionKind permissionKind,
            string errorMessage,
            CancellationToken cancellationToken)
        {
            var requestedAccountIds = accountIds
                .Where(accountId => accountId != Guid.Empty)
                .Distinct()
                .ToArray();

            if (requestedAccountIds.Length == 0)
            {
                return;
            }

            var permissions = await GetCurrentUserPermissionsAsync(
                requestedAccountIds,
                userId,
                isAdmin,
                cancellationToken);

            if (permissions.Count != requestedAccountIds.Length ||
                requestedAccountIds.Any(accountId =>
                    !permissions.TryGetValue(accountId, out var permission)
                    || !HasPermission(permission, permissionKind)))
            {
                throw new InvalidOperationException(errorMessage);
            }
        }

        private static AccountPermissionSummaryDTO ResolvePermissions(
            Account account,
            Guid userId,
            bool isAdmin)
        {
            if (account.IsCore)
            {
                return isAdmin
                    ? new AccountPermissionSummaryDTO
                    {
                        CanView = true,
                        CanPost = true,
                        CanEditTransaction = true,
                        CanDeleteTransaction = true,
                        CanManageAccess = false,
                        CanChangeOwner = false,
                        IsOwner = false,
                    }
                    : new AccountPermissionSummaryDTO();
            }

            if (isAdmin)
            {
                return FullAccess(isOwner: account.OwnerUserId == userId, canChangeOwner: true);
            }

            var isOwner = account.OwnerUserId == userId;
            if (isOwner)
            {
                return FullAccess(isOwner: true, canChangeOwner: false);
            }

            var explicitAccess = account.AccessEntries
                .FirstOrDefault(access => access.UserId == userId);

            if (explicitAccess is not null)
            {
                return new AccountPermissionSummaryDTO
                {
                    CanView = explicitAccess.CanView || explicitAccess.CanPost || explicitAccess.CanEditTransaction || explicitAccess.CanDeleteTransaction || explicitAccess.CanManageAccess,
                    CanPost = explicitAccess.CanPost,
                    CanEditTransaction = explicitAccess.CanEditTransaction,
                    CanDeleteTransaction = explicitAccess.CanDeleteTransaction,
                    CanManageAccess = explicitAccess.CanManageAccess,
                    CanChangeOwner = false,
                    IsOwner = false,
                };
            }

            if (account.IsGloballyShared)
            {
                return new AccountPermissionSummaryDTO
                {
                    CanView = true,
                    CanPost = true,
                    CanEditTransaction = true,
                    CanDeleteTransaction = true,
                    CanManageAccess = false,
                    CanChangeOwner = false,
                    IsOwner = false,
                };
            }

            var hasCustomAccessRules = account.AccessEntries.Count > 0;
            if (hasCustomAccessRules)
            {
                return new AccountPermissionSummaryDTO();
            }

            return new AccountPermissionSummaryDTO();
        }

        private static AccountPermissionSummaryDTO FullAccess(bool isOwner, bool canChangeOwner)
        {
            return new AccountPermissionSummaryDTO
            {
                CanView = true,
                CanPost = true,
                CanEditTransaction = true,
                CanDeleteTransaction = true,
                CanManageAccess = true,
                CanChangeOwner = canChangeOwner,
                IsOwner = isOwner,
            };
        }

        private static bool HasPermission(
            AccountPermissionSummaryDTO permission,
            PermissionKind permissionKind)
        {
            return permissionKind switch
            {
                PermissionKind.View => permission.CanView,
                PermissionKind.Post => permission.CanPost,
                PermissionKind.EditTransaction => permission.CanEditTransaction,
                PermissionKind.DeleteTransaction => permission.CanDeleteTransaction,
                PermissionKind.ManageAccess => permission.CanManageAccess,
                _ => false,
            };
        }
    }
}
