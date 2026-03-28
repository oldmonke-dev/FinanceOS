using Finance.Domain.Entities.Core;
using Finance.Domain.Enums;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace Finance.Infrastructure.Data
{
    public static class AppDbContextSeed
    {
        public static async Task EnsureAccountMetadataColumnsAsync(
            AppDbContext dbContext,
            CancellationToken cancellationToken = default)
        {
            const string sql = """
                ALTER TABLE "Accounts"
                ADD COLUMN IF NOT EXISTS "AccountNumber" character varying(50);

                ALTER TABLE "Accounts"
                ADD COLUMN IF NOT EXISTS "Description" character varying(500);
                """;

            await dbContext.Database.ExecuteSqlRawAsync(sql, cancellationToken);
        }

        public static async Task SeedBootstrapUsersAsync(
            AppDbContext dbContext,
            IEnumerable<(string Email, string Password)> bootstrapUsers,
            CancellationToken cancellationToken = default)
        {
            var passwordHasher = new PasswordHasher<User>();

            foreach (var bootstrapUser in bootstrapUsers
                .Where(item => !string.IsNullOrWhiteSpace(item.Email) && !string.IsNullOrWhiteSpace(item.Password))
                .GroupBy(item => item.Email.Trim(), StringComparer.OrdinalIgnoreCase)
                .Select(group => group.First()))
            {
                var normalizedEmail = bootstrapUser.Email.Trim();
                var user = await dbContext.Users
                    .FirstOrDefaultAsync(
                        existingUser => existingUser.Email.ToLower() == normalizedEmail.ToLower(),
                        cancellationToken);

                if (user is null)
                {
                    user = new User
                    {
                        Id = Guid.NewGuid(),
                        Email = normalizedEmail,
                        DisplayName = "Root User",
                        PasswordHash = string.Empty,
                        IsAdmin = true,
                        IsSuperUser = true,
                        IsActive = true,
                        CreatedAt = DateTime.UtcNow,
                        LastSeenAt = null,
                    };

                    dbContext.Users.Add(user);
                }
                else
                {
                    user.IsAdmin = true;
                    user.IsSuperUser = true;
                    user.IsActive = true;
                }

                user.PasswordHash = passwordHasher.HashPassword(user, bootstrapUser.Password);

                await dbContext.SaveChangesAsync(cancellationToken);

                var preferenceExists = await dbContext.UserPreferences
                    .AnyAsync(preference => preference.UserId == user.Id, cancellationToken);

                if (preferenceExists)
                {
                    continue;
                }

                dbContext.UserPreferences.Add(new UserPreference
                {
                    UserId = user.Id,
                    NumberGroupingStyle = "international",
                    UpdatedAt = DateTime.UtcNow,
                });

                await dbContext.SaveChangesAsync(cancellationToken);
            }
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
