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
            var query = _context.Accounts
                .Include(account => account.OwnerUser)
                .Include(account => account.AccessEntries)
                .AsQueryable();

            if (!isAdmin)
            {
                query = query.Where(account =>
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
                            || access.CanManageAccess))));
            }

            return await query.ToListAsync();
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

            Guid? ownerUserId = isAdmin ? null : userId;

            if (parentAccountId.HasValue)
            {
                var parentAccount = await _context.Accounts.FirstOrDefaultAsync(account => account.Id == parentAccountId.Value);

                if (parentAccount is null)
                {
                    throw new KeyNotFoundException("Parent account was not found.");
                }

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
                IsGloballyShared = false,
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
            await EnsureNoDuplicateAsync(
                account.ParentAccountId,
                account.AccountType,
                normalizedName,
                account.Id,
                account.OwnerUserId);

            account.Name = normalizedName;
            account.AccountNumber = NormalizeOptionalText(request.AccountNumber, 50);
            account.Description = NormalizeOptionalText(request.Description, 500);
            account.OpeningBalance = request.OpeningBalance ?? 0m;
            await _context.SaveChangesAsync();

            return await GetAccountWithOwnerAsync(account.Id);
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
    }
}
