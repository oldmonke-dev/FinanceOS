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

                ALTER TABLE "Accounts"
                ADD COLUMN IF NOT EXISTS "ReportingMode" character varying(40) NOT NULL DEFAULT 'Included';

                ALTER TABLE "Accounts"
                ADD COLUMN IF NOT EXISTS "IsCore" boolean NOT NULL DEFAULT FALSE;

                ALTER TABLE "Accounts"
                ADD COLUMN IF NOT EXISTS "IsGloballyShared" boolean NOT NULL DEFAULT FALSE;

                CREATE TABLE IF NOT EXISTS "AccountAccesses" (
                    "Id" uuid NOT NULL,
                    "AccountId" uuid NOT NULL,
                    "UserId" uuid NOT NULL,
                    "CanView" boolean NOT NULL DEFAULT FALSE,
                    "CanPost" boolean NOT NULL DEFAULT FALSE,
                    "CanEditTransaction" boolean NOT NULL DEFAULT FALSE,
                    "CanDeleteTransaction" boolean NOT NULL DEFAULT FALSE,
                    "CanManageAccess" boolean NOT NULL DEFAULT FALSE,
                    CONSTRAINT "PK_AccountAccesses" PRIMARY KEY ("Id"),
                    CONSTRAINT "FK_AccountAccesses_Accounts_AccountId" FOREIGN KEY ("AccountId") REFERENCES "Accounts" ("Id") ON DELETE CASCADE,
                    CONSTRAINT "FK_AccountAccesses_Users_UserId" FOREIGN KEY ("UserId") REFERENCES "Users" ("Id") ON DELETE CASCADE
                );

                CREATE UNIQUE INDEX IF NOT EXISTS "IX_AccountAccesses_AccountId_UserId"
                    ON "AccountAccesses" ("AccountId", "UserId");

                UPDATE "Accounts"
                SET "IsCore" = TRUE,
                    "IsGloballyShared" = FALSE,
                    "OwnerUserId" = NULL
                WHERE "ParentAccountId" IS NULL
                  AND (
                    ("Name" = 'Assets' AND "AccountType" = 1)
                    OR ("Name" = 'Liability' AND "AccountType" = 2)
                    OR ("Name" = 'Equity' AND "AccountType" = 3)
                    OR ("Name" = 'Income' AND "AccountType" = 4)
                    OR ("Name" = 'Expenses' AND "AccountType" = 5)
                  );

                UPDATE "Accounts" AS a
                SET "IsGloballyShared" = TRUE
                WHERE a."IsCore" = FALSE
                  AND a."OwnerUserId" IS NULL
                  AND NOT EXISTS (
                    SELECT 1
                    FROM "AccountAccesses" aa
                    WHERE aa."AccountId" = a."Id"
                  );
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

            var assets = await EnsureCoreAccountAsync(dbContext, accounts, "Assets", AccountType.Asset, cancellationToken);
            await EnsureCoreAccountAsync(dbContext, accounts, "Liability", AccountType.Liability, cancellationToken);
            await EnsureCoreAccountAsync(dbContext, accounts, "Equity", AccountType.Equity, cancellationToken);
            await EnsureCoreAccountAsync(dbContext, accounts, "Income", AccountType.Income, cancellationToken);
            await EnsureCoreAccountAsync(dbContext, accounts, "Expenses", AccountType.Expense, cancellationToken);

            var cashExists = accounts.Any(account =>
                account.Name == "Cash"
                && account.AccountType == AccountType.Asset
                && account.ParentAccountId == assets.Id);

            if (!cashExists)
            {
                dbContext.Accounts.Add(new Account
                {
                    Id = Guid.NewGuid(),
                    Name = "Cash",
                    AccountType = AccountType.Asset,
                    ParentAccountId = assets.Id,
                    IsGloballyShared = false,
                });
            }

            await dbContext.SaveChangesAsync(cancellationToken);
        }

        private static async Task<Account> EnsureCoreAccountAsync(
            AppDbContext dbContext,
            List<Account> accounts,
            string name,
            AccountType accountType,
            CancellationToken cancellationToken)
        {
            var account = accounts.FirstOrDefault(item =>
                item.ParentAccountId == null
                && item.Name == name
                && item.AccountType == accountType);

            if (account is null)
            {
                account = new Account
                {
                    Id = Guid.NewGuid(),
                    Name = name,
                    AccountType = accountType,
                    IsCore = true,
                    IsGloballyShared = false,
                };

                dbContext.Accounts.Add(account);
                accounts.Add(account);
            }

            account.IsCore = true;
            account.IsGloballyShared = false;
            account.OwnerUserId = null;

            await dbContext.SaveChangesAsync(cancellationToken);
            return account;
        }
    }
}
