using Finance.Domain.Entities.Core;
using Finance.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Finance.Infrastructure.Data
{
    public static class AppDbContextSeed
    {
        public static async Task SeedRootUserAsync(AppDbContext dbContext, CancellationToken cancellationToken = default)
        {
            var rootUser = await dbContext.Users
                .FirstOrDefaultAsync(user => user.Email == "root@finance.local", cancellationToken);

            if (rootUser is null)
            {
                rootUser = new User
                {
                    Id = Guid.NewGuid(),
                    Email = "root@finance.local",
                    DisplayName = "Root User",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    LastSeenAt = null,
                };

                dbContext.Users.Add(rootUser);
                await dbContext.SaveChangesAsync(cancellationToken);
            }

            var preferenceExists = await dbContext.UserPreferences
                .AnyAsync(preference => preference.UserId == rootUser.Id, cancellationToken);

            if (preferenceExists)
            {
                return;
            }

            dbContext.UserPreferences.Add(new UserPreference
            {
                UserId = rootUser.Id,
                NumberGroupingStyle = "international",
                UpdatedAt = DateTime.UtcNow,
            });

            await dbContext.SaveChangesAsync(cancellationToken);
        }

        public static async Task SeedDefaultAccountsAsync(AppDbContext dbContext, CancellationToken cancellationToken = default)
        {
            var accounts = await dbContext.Accounts
                .ToListAsync(cancellationToken);

            if (accounts.Count > 0)
            {
                return;
            }

            var assets = new Account
            {
                Id = Guid.NewGuid(),
                Name = "Assets",
                AccountType = AccountType.Asset,
            };

            var liabilities = new Account
            {
                Id = Guid.NewGuid(),
                Name = "Liability",
                AccountType = AccountType.Liability,
            };

            var income = new Account
            {
                Id = Guid.NewGuid(),
                Name = "Income",
                AccountType = AccountType.Income,
            };

            var expenses = new Account
            {
                Id = Guid.NewGuid(),
                Name = "Expenses",
                AccountType = AccountType.Expense,
            };

            var cash = new Account
            {
                Id = Guid.NewGuid(),
                Name = "Cash",
                AccountType = AccountType.Asset,
                ParentAccountId = assets.Id,
            };

            dbContext.Accounts.AddRange(assets, liabilities, income, expenses, cash);
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }
}
