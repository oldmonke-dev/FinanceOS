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
            var normalizedName = (accountDto.Name ?? string.Empty).Trim();
            var accountType = accountDto.AccountType ?? Domain.Enums.AccountType.Asset;
            var parentAccountId = accountDto.ParentAccountId;

            if (string.IsNullOrWhiteSpace(normalizedName))
            {
                throw new InvalidOperationException("Account name is required.");
            }

            var duplicateExists = await _context.Accounts.AnyAsync(account =>
                account.ParentAccountId == parentAccountId
                && account.AccountType == accountType
                && account.Name.ToLower() == normalizedName.ToLower());

            if (duplicateExists)
            {
                throw new InvalidOperationException(
                    "An account with the same name, account type, and level already exists.");
            }

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
    }
}
