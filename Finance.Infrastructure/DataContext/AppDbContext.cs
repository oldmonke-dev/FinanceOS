using Finance.Domain.Entities.Core;
using Finance.Domain.Entities.UserSession;
using Finance.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Finance.Infrastructure.Data
{
    public class AppDbContext : DbContext
    {
        public AppDbContext(DbContextOptions<AppDbContext> options)
            : base(options)
        {
        }

        public DbSet<Account> Accounts => Set<Account>();
        public DbSet<Split> Splits => Set<Split>();
        public DbSet<Transaction> Transactions => Set<Transaction>();
        public DbSet<User> Users => Set<User>();
        public DbSet<UserPreference> UserPreferences => Set<UserPreference>();
        public DbSet<ImportSession> ImportSessions => Set<ImportSession>();
        public DbSet<ImportSessionRow> ImportSessionRows => Set<ImportSessionRow>();
        public DbSet<ImportLearningStat> ImportLearningStats => Set<ImportLearningStat>();
        public DbSet<ImportSessionLearningEntry> ImportSessionLearningEntries => Set<ImportSessionLearningEntry>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            modelBuilder.Entity<Account>()
                  .HasOne(a => a.ParentAccount)
                  .WithMany(a => a.Children)
                  .HasForeignKey(a => a.ParentAccountId)
                  .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Account>()
                .HasOne(a => a.OwnerUser)
                .WithMany()
                .HasForeignKey(a => a.OwnerUserId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Split>()
                .HasOne(s => s.Account)
                .WithMany(a => a.Splits)
                .HasForeignKey(s => s.AccountId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Split>()
                .HasOne(s => s.Transaction)
                .WithMany(t => t.Splits)
                .HasForeignKey(s => s.TransactionId)
                .OnDelete(DeleteBehavior.Cascade);

            modelBuilder.Entity<Split>()
                .Property(s => s.Amount)
                .HasPrecision(18, 2);

            modelBuilder.Entity<User>(entity =>
            {
                entity.HasKey(user => user.Id);

                entity.Property(user => user.Email)
                    .IsRequired()
                    .HasMaxLength(320);

                entity.Property(user => user.DisplayName)
                    .IsRequired()
                    .HasMaxLength(200);

                entity.Property(user => user.PasswordHash)
                    .IsRequired()
                    .HasMaxLength(1000);

                entity.Property(user => user.IsAdmin)
                    .HasDefaultValue(false);

                entity.Property(user => user.IsSuperUser)
                    .HasDefaultValue(false);

                entity.Property(user => user.IsActive)
                    .HasDefaultValue(true);

                entity.HasIndex(user => user.Email)
                    .IsUnique();
            });

            modelBuilder.Entity<UserPreference>(entity =>
            {
                entity.HasKey(preference => preference.UserId);

                entity.Property(preference => preference.NumberGroupingStyle)
                    .IsRequired()
                    .HasMaxLength(40)
                    .HasDefaultValue("international");

                entity.Property(preference => preference.UpdatedAt)
                    .HasColumnType("timestamp with time zone");

                entity.HasOne(preference => preference.User)
                    .WithOne(user => user.Preference)
                    .HasForeignKey<UserPreference>(preference => preference.UserId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ImportSession>(entity =>
            {
                entity.HasKey(session => session.Id);

                entity.Property(session => session.FileName)
                    .HasMaxLength(260);

                entity.Property(session => session.Label)
                    .IsRequired()
                    .HasMaxLength(100);

                entity.Property(session => session.IsDeletable)
                    .HasDefaultValue(true);

                entity.Property(session => session.Strategy)
                    .IsRequired()
                    .HasMaxLength(100);

                entity.Property<bool>("HasExclusions")
                    .HasDefaultValue(false);

                entity.Property(session => session.IsArchived)
                    .HasDefaultValue(false);

                entity.Property(session => session.Status)
                    .IsRequired()
                    .HasMaxLength(40)
                    .HasDefaultValue("Active");

                entity.Property(session => session.ColumnMappingsJson)
                    .IsRequired()
                    .HasColumnType("jsonb");

                entity.HasOne(session => session.User)
                    .WithMany()
                    .HasForeignKey(session => session.UserId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasOne(session => session.SourceAccount)
                    .WithMany()
                    .HasForeignKey(session => session.SourceAccountId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasMany(session => session.Rows)
                    .WithOne(row => row.ImportSession)
                    .HasForeignKey(row => row.ImportSessionId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ImportSessionRow>(entity =>
            {
                entity.HasKey(row => row.Id);

                entity.Property(row => row.ValuesJson)
                    .IsRequired()
                    .HasColumnType("jsonb");

                entity.Property(row => row.DestinationAccountError)
                    .HasMaxLength(500);

                entity.Property(row => row.MappingSource)
                    .IsRequired()
                    .HasMaxLength(40)
                    .HasDefaultValue("none");

                entity.Property<bool>("IncludeInLedger")
                    .HasDefaultValue(true);

                entity.Property(row => row.AddedToLedgerAt)
                    .HasColumnType("timestamp with time zone");

                entity.HasOne(row => row.DestinationAccount)
                    .WithMany()
                    .HasForeignKey(row => row.DestinationAccountId)
                    .OnDelete(DeleteBehavior.Restrict);

                entity.HasMany(row => row.LearningEntries)
                    .WithOne(entry => entry.ImportSessionRow)
                    .HasForeignKey(entry => entry.ImportSessionRowId)
                    .OnDelete(DeleteBehavior.Cascade);
            });

            modelBuilder.Entity<ImportLearningStat>(entity =>
            {
                entity.HasKey(item => item.Id);

                entity.Property(item => item.FeatureKey)
                    .IsRequired()
                    .HasMaxLength(300);

                entity.Property(item => item.Count)
                    .HasDefaultValue(0);

                entity.HasIndex(item => new { item.UserId, item.DestinationAccountId, item.FeatureKey })
                    .IsUnique();

                entity.HasOne(item => item.User)
                    .WithMany()
                    .HasForeignKey(item => item.UserId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(item => item.DestinationAccount)
                    .WithMany()
                    .HasForeignKey(item => item.DestinationAccountId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

            modelBuilder.Entity<ImportSessionLearningEntry>(entity =>
            {
                entity.HasKey(item => item.Id);

                entity.Property(item => item.FeatureKey)
                    .IsRequired()
                    .HasMaxLength(300);

                entity.Property(item => item.CreatedAt)
                    .HasColumnType("timestamp with time zone");

                entity.HasIndex(item => new { item.ImportSessionId, item.ImportSessionRowId, item.DestinationAccountId, item.FeatureKey })
                    .IsUnique();

                entity.HasOne(item => item.ImportSession)
                    .WithMany()
                    .HasForeignKey(item => item.ImportSessionId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(item => item.ImportSessionRow)
                    .WithMany(row => row.LearningEntries)
                    .HasForeignKey(item => item.ImportSessionRowId)
                    .OnDelete(DeleteBehavior.Cascade);

                entity.HasOne(item => item.DestinationAccount)
                    .WithMany()
                    .HasForeignKey(item => item.DestinationAccountId)
                    .OnDelete(DeleteBehavior.Restrict);
            });

        }
    }
}
