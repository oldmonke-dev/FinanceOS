using Finance.Domain.Entities.Core;
using Finance.Domain.Entities.UserSession;
using Microsoft.EntityFrameworkCore;

namespace Finance.BusinessLayer.Interfaces
{
    public interface IAppDbContext
    {
        DbSet<Account> Accounts { get; }

        DbSet<AccountAccess> AccountAccesses { get; }

        DbSet<Split> Splits { get; }

        DbSet<Transaction> Transactions { get; }

        DbSet<User> Users { get; }

        DbSet<UserPreference> UserPreferences { get; }

        DbSet<ImportSession> ImportSessions { get; }

        DbSet<ImportSessionRow> ImportSessionRows { get; }

        DbSet<ImportLearningStat> ImportLearningStats { get; }

        DbSet<ImportSessionLearningEntry> ImportSessionLearningEntries { get; }

        Task<int> SaveChangesAsync(CancellationToken cancellationToken = default);
    }
}
