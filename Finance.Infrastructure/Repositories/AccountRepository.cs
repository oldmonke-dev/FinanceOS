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

        public async Task<List<Account>> GetAllAccountsAsync()
        {
            return await _context.Accounts.ToListAsync();
        }

        public async Task<HashSet<Guid>> GetExistingAccountIdsAsync(IEnumerable<Guid> accountIds, CancellationToken cancellationToken = default)
        {
            var requestedAccountIds = accountIds.Distinct().ToArray();

            return await _context.Accounts
                .Where(account => requestedAccountIds.Contains(account.Id))
                .Select(account => account.Id)
                .ToHashSetAsync(cancellationToken);
        }

        public async Task<Account> CreateNewAccountAsync(AccountDTO accountDto)
        {
            var normalizedName = NormalizeAccountName(accountDto.Name);
            var accountType = accountDto.AccountType ?? Domain.Enums.AccountType.Asset;
            var parentAccountId = accountDto.ParentAccountId;
            await EnsureNoDuplicateAsync(parentAccountId, accountType, normalizedName);

            var account = new Account
            {
                Id = accountDto.Id == Guid.Empty ? Guid.NewGuid() : accountDto.Id,
                Name = normalizedName,
                AccountType = accountType,
                ParentAccountId = parentAccountId
            };

            _context.Accounts.Add(account);
            await _context.SaveChangesAsync();

            return account;
        }

        public async Task<Account> RenameAccountAsync(Guid accountId, UpdateAccountNameDTO request)
        {
            var account = await _context.Accounts.FirstOrDefaultAsync(item => item.Id == accountId);

            if (account is null)
            {
                throw new KeyNotFoundException("Account was not found.");
            }

            var normalizedName = NormalizeAccountName(request.Name);
            await EnsureNoDuplicateAsync(
                account.ParentAccountId,
                account.AccountType,
                normalizedName,
                account.Id);

            account.Name = normalizedName;
            await _context.SaveChangesAsync();

            return account;
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
            Guid? excludedAccountId = null)
        {
            var duplicateExists = await _context.Accounts.AnyAsync(account =>
                account.ParentAccountId == parentAccountId
                && account.AccountType == accountType
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
