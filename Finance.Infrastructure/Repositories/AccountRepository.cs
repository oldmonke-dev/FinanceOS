using Finance.BusinessLayer.DTOs;
using Finance.Domain.Entities.Core;
using Finance.Domain.Interfaces;
using Finance.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Finance.Infrastructure.Repositories
{
    public class AccountRepository : IAccountRepository
    {
        private readonly AppDbContext _context;

        public AccountRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<List<Account>> GetAllAccountsAsync(Guid userId, bool isAdmin)
        {
            var query = _context.Accounts
                .Include(account => account.OwnerUser)
                .AsQueryable();

            if (!isAdmin)
            {
                query = query.Where(account => account.OwnerUserId == null || account.OwnerUserId == userId);
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

                if (!isAdmin && parentAccount.OwnerUserId.HasValue && parentAccount.OwnerUserId != userId)
                {
                    throw new InvalidOperationException("You cannot create an account under another user's private account.");
                }
            }

            await EnsureNoDuplicateAsync(parentAccountId, accountType, normalizedName, ownerUserId: ownerUserId);

            var account = new Account
            {
                Id = accountDto.Id == Guid.Empty ? Guid.NewGuid() : accountDto.Id,
                Name = normalizedName,
                AccountType = accountType,
                OpeningBalance = accountDto.OpeningBalance ?? 0m,
                ParentAccountId = parentAccountId,
                OwnerUserId = ownerUserId,
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

            if (!isAdmin && account.OwnerUserId != userId)
            {
                throw new InvalidOperationException("You can only rename your own accounts.");
            }

            var normalizedName = NormalizeAccountName(request.Name);
            await EnsureNoDuplicateAsync(
                account.ParentAccountId,
                account.AccountType,
                normalizedName,
                account.Id,
                account.OwnerUserId);

            account.Name = normalizedName;
            account.OpeningBalance = request.OpeningBalance ?? 0m;
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
