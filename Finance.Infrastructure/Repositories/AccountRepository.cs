using Finance.BusinessLayer.DTOs;
using Finance.BusinessLayer.Interfaces;
using Finance.Domain.Entities.Core;
using Finance.Domain.Interfaces;
using Finance.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Finance.Infrastructure.Repositories
{
    public class AccountRepository : IAccountRepository
    {
        private readonly AppDbContext _context;
        private readonly IAccountAccessService _accountAccessService;

        public AccountRepository(AppDbContext context, IAccountAccessService accountAccessService)
        {
            _context = context;
            _accountAccessService = accountAccessService;
        }

        public async Task<List<Account>> GetAllAccountsAsync(Guid userId, bool isAdmin)
        {
            var accounts = await _context.Accounts
                .Include(account => account.OwnerUser)
                .Include(account => account.AccessEntries)
                .ToListAsync();

            if (isAdmin)
            {
                return accounts;
            }

            var accountById = accounts.ToDictionary(account => account.Id);
            var visibleIds = accounts
                .Where(account =>
                    !account.IsCore
                    && (
                        account.OwnerUserId == userId
                        || account.IsGloballyShared
                        || account.AccessEntries.Any(access =>
                            access.UserId == userId
                            && (access.CanView
                                || access.CanPost
                                || access.CanEditTransaction
                                || access.CanDeleteTransaction
                                || access.CanManageAccess))))
                .Select(account => account.Id)
                .ToHashSet();

            var requiredIds = new HashSet<Guid>(visibleIds);
            foreach (var accountId in visibleIds.ToList())
            {
                var current = accountById[accountId];
                while (current.ParentAccountId.HasValue
                    && accountById.TryGetValue(current.ParentAccountId.Value, out var parent))
                {
                    if (!requiredIds.Add(parent.Id))
                    {
                        break;
                    }

                    current = parent;
                }
            }

            return accounts
                .Where(account => requiredIds.Contains(account.Id))
                .ToList();
        }

        public async Task<HashSet<Guid>> GetExistingAccountIdsAsync(IEnumerable<Guid> accountIds, CancellationToken cancellationToken = default)
        {
            var requestedAccountIds = accountIds.Distinct().ToArray();

            return await _context.Accounts
                .Where(account => requestedAccountIds.Contains(account.Id))
                .Select(account => account.Id)
                .ToHashSetAsync(cancellationToken);
        }

        public async Task<Account> CreateNewAccountAsync(AccountDTO accountDto, Guid userId, bool isAdmin)
        {
            var normalizedName = NormalizeAccountName(accountDto.Name);
            var accountType = accountDto.AccountType ?? Domain.Enums.AccountType.Asset;
            var parentAccountId = accountDto.ParentAccountId;

            if (!isAdmin && parentAccountId == null)
            {
                throw new InvalidOperationException("Only admins can create top-level accounts.");
            }

            Guid? ownerUserId = userId;
            var isGloballyShared = false;

            if (parentAccountId.HasValue)
            {
                var parentAccount = await _context.Accounts.FirstOrDefaultAsync(account => account.Id == parentAccountId.Value);

                if (parentAccount is null)
                {
                    throw new KeyNotFoundException("Parent account was not found.");
                }

                accountType = parentAccount.AccountType;

                if (!isAdmin)
                {
                    await _accountAccessService.EnsureCanManageAccountAsync(parentAccount.Id, userId, isAdmin);
                }
            }

            await EnsureNoDuplicateAsync(parentAccountId, accountType, normalizedName, ownerUserId: ownerUserId);

            var account = new Account
            {
                Id = accountDto.Id == Guid.Empty ? Guid.NewGuid() : accountDto.Id,
                Name = normalizedName,
                AccountNumber = NormalizeOptionalText(accountDto.AccountNumber, 50),
                Description = NormalizeOptionalText(accountDto.Description, 500),
                AccountType = accountType,
                OpeningBalance = accountDto.OpeningBalance ?? 0m,
                ParentAccountId = parentAccountId,
                OwnerUserId = ownerUserId,
                IsGloballyShared = isGloballyShared,
            };

            _context.Accounts.Add(account);
            await _context.SaveChangesAsync();

            return await GetAccountWithOwnerAsync(account.Id);
        }

        public async Task<Account> RenameAccountAsync(Guid accountId, UpdateAccountNameDTO request, Guid userId, bool isAdmin)
        {
            var account = await _context.Accounts.FirstOrDefaultAsync(item => item.Id == accountId);

            if (account is null)
            {
                throw new KeyNotFoundException("Account was not found.");
            }

            if (account.IsCore)
            {
                throw new InvalidOperationException("Core accounts cannot be renamed or edited.");
            }

            if (!isAdmin)
            {
                await _accountAccessService.EnsureCanManageAccountAsync(account.Id, userId, isAdmin);
            }

            var normalizedName = NormalizeAccountName(request.Name);
            var nextParentAccountId = request.ParentAccountId;
            var nextAccountType = account.AccountType;

            if (!isAdmin && nextParentAccountId is null)
            {
                throw new InvalidOperationException("Only admins can move accounts to the top level.");
            }

            if (nextParentAccountId == account.Id)
            {
                throw new InvalidOperationException("An account cannot be moved under itself.");
            }

            if (nextParentAccountId.HasValue)
            {
                var parentAccount = await _context.Accounts.FirstOrDefaultAsync(item => item.Id == nextParentAccountId.Value);

                if (parentAccount is null)
                {
                    throw new KeyNotFoundException("Parent account was not found.");
                }

                if (await IsDescendantOfAsync(nextParentAccountId.Value, account.Id))
                {
                    throw new InvalidOperationException("An account cannot be moved under one of its descendants.");
                }

                if (!isAdmin)
                {
                    await _accountAccessService.EnsureCanManageAccountAsync(parentAccount.Id, userId, isAdmin);
                }

                nextAccountType = parentAccount.AccountType;
            }

            await EnsureNoDuplicateAsync(
                nextParentAccountId,
                nextAccountType,
                normalizedName,
                account.Id,
                account.OwnerUserId);

            account.Name = normalizedName;
            account.AccountNumber = NormalizeOptionalText(request.AccountNumber, 50);
            account.Description = NormalizeOptionalText(request.Description, 500);
            account.OpeningBalance = request.OpeningBalance ?? 0m;
            account.ParentAccountId = nextParentAccountId;
            if (account.AccountType != nextAccountType)
            {
                await UpdateSubtreeAccountTypeAsync(account.Id, nextAccountType);
            }
            await _context.SaveChangesAsync();

            return await GetAccountWithOwnerAsync(account.Id);
        }

        public async Task<List<UpdateAccountResultDTO>> BatchUpdateAccountsAsync(
            BatchUpdateAccountsDTO request,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default)
        {
            var requestedAccountIds = request.AccountIds
                .Where(accountId => accountId != Guid.Empty)
                .Distinct()
                .ToArray();

            if (requestedAccountIds.Length == 0)
            {
                throw new InvalidOperationException("Select at least one account.");
            }

            var accounts = await _context.Accounts.ToListAsync(cancellationToken);
            var accountById = accounts.ToDictionary(account => account.Id);
            var selectedAccounts = requestedAccountIds
                .Select(accountId => accountById.TryGetValue(accountId, out var account) ? account : null)
                .ToList();

            if (selectedAccounts.Any(account => account is null))
            {
                throw new KeyNotFoundException("One or more selected accounts were not found.");
            }

            var materializedSelectedAccounts = selectedAccounts
                .OfType<Account>()
                .ToList();
            var selectedAccountIds = materializedSelectedAccounts
                .Select(account => account.Id)
                .ToHashSet();

            if (!isAdmin)
            {
                foreach (var account in materializedSelectedAccounts)
                {
                    await _accountAccessService.EnsureCanManageAccountAsync(
                        account.Id,
                        userId,
                        isAdmin,
                        cancellationToken);
                }
            }

            Account? nextParent = null;
            if (request.ApplyMove && request.ParentAccountId.HasValue)
            {
                if (!accountById.TryGetValue(request.ParentAccountId.Value, out nextParent))
                {
                    throw new KeyNotFoundException("Parent account was not found.");
                }

                if (!isAdmin)
                {
                    await _accountAccessService.EnsureCanManageAccountAsync(
                        nextParent.Id,
                        userId,
                        isAdmin,
                        cancellationToken);
                }
            }

            if (!isAdmin && request.ApplyMove && request.ParentAccountId is null)
            {
                throw new InvalidOperationException("Only admins can move accounts to the top level.");
            }

            if ((request.ApplyOwner || request.ApplyGlobalSharing) && materializedSelectedAccounts.Any(account => account.IsCore))
            {
                throw new InvalidOperationException("Core accounts do not support owner or sharing changes.");
            }

            if (request.ApplyMove && materializedSelectedAccounts.Any(account => account.IsCore))
            {
                throw new InvalidOperationException("Core accounts cannot be moved.");
            }

            if (request.ApplyOwner && request.OwnerUserId.HasValue)
            {
                var userExists = await _context.Users.AnyAsync(
                    item => item.Id == request.OwnerUserId.Value && item.IsActive,
                    cancellationToken);

                if (!userExists)
                {
                    throw new InvalidOperationException("The selected owner was not found or is inactive.");
                }
            }

            if (request.ApplyMove)
            {
                foreach (var account in materializedSelectedAccounts)
                {
                    if (selectedAccountIds.Contains(account.ParentAccountId.GetValueOrDefault()))
                    {
                        throw new InvalidOperationException(
                            "Batch move does not support selecting both a parent account and one of its descendants.");
                    }

                    if (request.ParentAccountId == account.Id)
                    {
                        throw new InvalidOperationException("An account cannot be moved under itself.");
                    }

                    if (request.ParentAccountId.HasValue
                        && IsDescendantOf(request.ParentAccountId.Value, account.Id, accountById))
                    {
                        throw new InvalidOperationException(
                            "An account cannot be moved under one of its descendants.");
                    }
                }
            }

            var subtreeIdsByAccountId = materializedSelectedAccounts.ToDictionary(
                account => account.Id,
                account => CollectSubtreeIds(account.Id, accountById));

            var projectedAccounts = accounts.ToDictionary(
                account => account.Id,
                account => new ProjectedAccountState
                {
                    Id = account.Id,
                    Name = account.Name,
                    ParentAccountId = account.ParentAccountId,
                    AccountType = account.AccountType,
                    OwnerUserId = account.OwnerUserId,
                    IsGloballyShared = account.IsGloballyShared,
                });

            foreach (var account in materializedSelectedAccounts)
            {
                var projected = projectedAccounts[account.Id];
                var nextOwnerUserId = request.ApplyOwner ? request.OwnerUserId : projected.OwnerUserId;

                if (request.ApplyMove)
                {
                    projected.ParentAccountId = request.ParentAccountId;

                    if (nextParent is not null)
                    {
                        foreach (var subtreeId in subtreeIdsByAccountId[account.Id])
                        {
                            projectedAccounts[subtreeId].AccountType = nextParent.AccountType;
                        }
                    }
                }

                if (request.ApplyOwner)
                {
                    projected.OwnerUserId = nextOwnerUserId;
                }

                if (request.ApplyGlobalSharing)
                {
                    projected.IsGloballyShared = nextOwnerUserId is null || request.IsGloballyShared;
                }
                else if (request.ApplyOwner && nextOwnerUserId is null)
                {
                    projected.IsGloballyShared = true;
                }
            }

            var duplicateGroup = projectedAccounts.Values
                .GroupBy(account => new
                {
                    account.ParentAccountId,
                    account.AccountType,
                    account.OwnerUserId,
                    Name = account.Name.Trim().ToLowerInvariant(),
                })
                .FirstOrDefault(group => group.Count() > 1);

            if (duplicateGroup is not null)
            {
                throw new InvalidOperationException(
                    "The selected changes would create duplicate account names at the same level.");
            }

            var results = new List<UpdateAccountResultDTO>();
            foreach (var account in materializedSelectedAccounts)
            {
                var subtreeIds = subtreeIdsByAccountId[account.Id];
                var nextType = nextParent?.AccountType ?? account.AccountType;
                var accountTypeChanged = request.ApplyMove && nextParent is not null && account.AccountType != nextType;

                if (request.ApplyMove)
                {
                    account.ParentAccountId = request.ParentAccountId;
                }

                if (request.ApplyOwner)
                {
                    account.OwnerUserId = request.OwnerUserId;
                    if (request.OwnerUserId is null)
                    {
                        account.IsGloballyShared = true;
                    }
                }

                if (request.ApplyGlobalSharing)
                {
                    account.IsGloballyShared = account.OwnerUserId is null || request.IsGloballyShared;
                }

                if (accountTypeChanged)
                {
                    foreach (var subtreeId in subtreeIds)
                    {
                        accountById[subtreeId].AccountType = nextType;
                    }
                }

                results.Add(new UpdateAccountResultDTO
                {
                    Id = account.Id,
                    Name = account.Name,
                    UpdatedNodeCount = accountTypeChanged ? subtreeIds.Count : 1,
                    AccountTypeChanged = accountTypeChanged,
                });
            }

            await _context.SaveChangesAsync(cancellationToken);
            return results;
        }

        public async Task<Account> UpdateAccountOwnerAsync(Guid accountId, Guid? ownerUserId, Guid userId, bool isAdmin)
        {
            if (!isAdmin)
            {
                await _accountAccessService.EnsureCanManageAccountAsync(accountId, userId, isAdmin);
            }

            var account = await _context.Accounts.FirstOrDefaultAsync(item => item.Id == accountId);

            if (account is null)
            {
                throw new KeyNotFoundException("Account was not found.");
            }

            if (account.IsCore)
            {
                throw new InvalidOperationException("Core accounts use fixed global admin ownership.");
            }

            if (ownerUserId.HasValue)
            {
                var userExists = await _context.Users.AnyAsync(item => item.Id == ownerUserId.Value && item.IsActive);
                if (!userExists)
                {
                    throw new InvalidOperationException("The selected user was not found or is inactive.");
                }
            }

            await EnsureNoDuplicateAsync(
                account.ParentAccountId,
                account.AccountType,
                account.Name,
                account.Id,
                ownerUserId);

            account.OwnerUserId = ownerUserId;
            account.IsGloballyShared = ownerUserId is null || account.IsGloballyShared;
            await _context.SaveChangesAsync();

            return await GetAccountWithOwnerAsync(account.Id);
        }

        private async Task<Account> GetAccountWithOwnerAsync(Guid accountId)
        {
            return await _context.Accounts
                .Include(account => account.OwnerUser)
                .FirstAsync(account => account.Id == accountId);
        }

        private static string NormalizeAccountName(string? name)
        {
            var normalizedName = (name ?? string.Empty).Trim();

            if (string.IsNullOrWhiteSpace(normalizedName))
            {
                throw new InvalidOperationException("Account name is required.");
            }

            return normalizedName;
        }

        private static string? NormalizeOptionalText(string? value, int maxLength)
        {
            var normalized = value?.Trim();

            if (string.IsNullOrWhiteSpace(normalized))
            {
                return null;
            }

            if (normalized.Length > maxLength)
            {
                throw new InvalidOperationException($"Field cannot exceed {maxLength} characters.");
            }

            return normalized;
        }

        private async Task EnsureNoDuplicateAsync(
            Guid? parentAccountId,
            Domain.Enums.AccountType accountType,
            string normalizedName,
            Guid? excludedAccountId = null,
            Guid? ownerUserId = null)
        {
            var duplicateExists = await _context.Accounts.AnyAsync(account =>
                account.ParentAccountId == parentAccountId
                && account.AccountType == accountType
                && account.OwnerUserId == ownerUserId
                && account.Name.ToLower() == normalizedName.ToLower()
                && (!excludedAccountId.HasValue || account.Id != excludedAccountId.Value));

            if (duplicateExists)
            {
                throw new InvalidOperationException(
                    "An account with the same name, account type, and level already exists.");
            }
        }

        private async Task<bool> IsDescendantOfAsync(Guid candidateParentId, Guid accountId)
        {
            var currentParentId = candidateParentId;

            while (true)
            {
                var currentAccount = await _context.Accounts
                    .AsNoTracking()
                    .Where(item => item.Id == currentParentId)
                    .Select(item => new { item.Id, item.ParentAccountId })
                    .FirstOrDefaultAsync();

                if (currentAccount is null || currentAccount.ParentAccountId is null)
                {
                    return false;
                }

                if (currentAccount.ParentAccountId.Value == accountId)
                {
                    return true;
                }

                currentParentId = currentAccount.ParentAccountId.Value;
            }
        }

        private async Task UpdateSubtreeAccountTypeAsync(
            Guid rootAccountId,
            Domain.Enums.AccountType nextAccountType)
        {
            var accounts = await _context.Accounts.ToListAsync();
            var accountById = accounts.ToDictionary(account => account.Id);

            foreach (var subtreeId in CollectSubtreeIds(rootAccountId, accountById))
            {
                accountById[subtreeId].AccountType = nextAccountType;
            }
        }

        private static HashSet<Guid> CollectSubtreeIds(Guid rootAccountId, Dictionary<Guid, Account> accountById)
        {
            var subtreeIds = new HashSet<Guid>();
            var stack = new Stack<Guid>();
            stack.Push(rootAccountId);

            while (stack.Count > 0)
            {
                var currentId = stack.Pop();
                if (!subtreeIds.Add(currentId))
                {
                    continue;
                }

                foreach (var child in accountById.Values.Where(account => account.ParentAccountId == currentId))
                {
                    stack.Push(child.Id);
                }
            }

            return subtreeIds;
        }

        private static bool IsDescendantOf(
            Guid candidateParentId,
            Guid accountId,
            Dictionary<Guid, Account> accountById)
        {
            var currentParentId = candidateParentId;

            while (accountById.TryGetValue(currentParentId, out var currentAccount)
                && currentAccount.ParentAccountId.HasValue)
            {
                if (currentAccount.ParentAccountId.Value == accountId)
                {
                    return true;
                }

                currentParentId = currentAccount.ParentAccountId.Value;
            }

            return false;
        }

        private sealed class ProjectedAccountState
        {
            public Guid Id { get; set; }

            public string Name { get; set; } = string.Empty;

            public Guid? ParentAccountId { get; set; }

            public Domain.Enums.AccountType AccountType { get; set; }

            public Guid? OwnerUserId { get; set; }

            public bool IsGloballyShared { get; set; }
        }
    }
}
