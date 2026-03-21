using System.Globalization;
using System.Text.Json;
using Finance.BusinessLayer.DTOs;
using Finance.BusinessLayer.Interfaces;
using Finance.Domain.Entities.Core;
using Finance.Domain.Entities.UserSession;
using Finance.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Finance.Infrastructure.Services
{
    public class AccountWorkflowService : IAccountWorkflowService
    {
        private static readonly Guid RootUserId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");

        private readonly AppDbContext _context;

        public AccountWorkflowService(AppDbContext context)
        {
            _context = context;
        }

        public async Task<AccountDeletionResultDTO> DeleteAccountAsync(
            Guid accountId,
            CancellationToken cancellationToken = default)
        {
            var account = await _context.Accounts
                .Include(item => item.Children)
                .FirstOrDefaultAsync(item => item.Id == accountId, cancellationToken);

            if (account is null)
            {
                throw new KeyNotFoundException("Account was not found.");
            }

            if (account.Children.Count > 0)
            {
                throw new InvalidOperationException("Delete child accounts first.");
            }

            var affectedTransactions = await _context.Transactions
                .Include(transaction => transaction.Splits)
                .Where(transaction => transaction.Splits.Any(split => split.AccountId == accountId))
                .OrderBy(transaction => transaction.TransactionDate)
                .ThenBy(transaction => transaction.CreatedAt)
                .ToListAsync(cancellationToken);

            ImportSession? remediationSession = null;
            if (affectedTransactions.Count > 0)
            {
                remediationSession = BuildAccountDeletionSession(account.Name, accountId, affectedTransactions);
                _context.ImportSessions.Add(remediationSession);
                _context.Transactions.RemoveRange(affectedTransactions);
            }

            await ClearImportSessionReferencesAsync(accountId, cancellationToken);

            _context.Accounts.Remove(account);
            await _context.SaveChangesAsync(cancellationToken);

            return new AccountDeletionResultDTO
            {
                DeletedAccountId = accountId,
                CreatedImportSessionId = remediationSession?.Id,
                AffectedTransactionCount = affectedTransactions.Count,
            };
        }

        private async Task ClearImportSessionReferencesAsync(Guid accountId, CancellationToken cancellationToken)
        {
            var sourceSessions = await _context.ImportSessions
                .Where(session => session.SourceAccountId == accountId)
                .ToListAsync(cancellationToken);

            foreach (var session in sourceSessions)
            {
                session.SourceAccountId = null;
            }

            var destinationRows = await _context.ImportSessionRows
                .Where(row => row.DestinationAccountId == accountId)
                .ToListAsync(cancellationToken);

            foreach (var row in destinationRows)
            {
                row.DestinationAccountId = null;
                row.DestinationAccountError = "Account deleted. Please remap.";
            }
        }

        private static ImportSession BuildAccountDeletionSession(
            string deletedAccountName,
            Guid deletedAccountId,
            IReadOnlyList<Transaction> transactions)
        {
            var rows = new List<ImportSessionRow>();

            for (var index = 0; index < transactions.Count; index += 1)
            {
                var transaction = transactions[index];
                var deletedSplit = transaction.Splits.First(split => split.AccountId == deletedAccountId);
                var destinationAccountId = ResolvePrefilledDestinationAccountId(transaction, deletedAccountId);
                var amount = -deletedSplit.Amount;

                rows.Add(new ImportSessionRow
                {
                    Id = Guid.NewGuid(),
                    RowIndex = index,
                    ValuesJson = JsonSerializer.Serialize(new[]
                    {
                        transaction.TransactionDate.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture),
                        transaction.Description ?? string.Empty,
                        transaction.ReferenceNumber ?? string.Empty,
                        deletedSplit.Memo ?? string.Empty,
                        amount.ToString(CultureInfo.InvariantCulture),
                    }),
                    DestinationAccountId = destinationAccountId,
                    DestinationAccountError = null,
                    IncludeInLedger = true,
                });
            }

            return new ImportSession
            {
                Id = Guid.NewGuid(),
                UserId = RootUserId,
                FileName = $"Account removal - {deletedAccountName}",
                SourceAccountId = null,
                CreatedAt = DateTime.UtcNow,
                Label = "account_deletion_sessions",
                IsDeletable = false,
                Strategy = "bayesian_statistics",
                HasExclusions = false,
                IsArchived = false,
                Status = "Active",
                ColumnMappingsJson = JsonSerializer.Serialize(new Dictionary<int, string>
                {
                    [0] = "date",
                    [1] = "description",
                    [2] = "reference",
                    [3] = "memo",
                    [4] = "amount",
                }),
                Rows = rows,
            };
        }

        private static Guid? ResolvePrefilledDestinationAccountId(
            Transaction transaction,
            Guid deletedAccountId)
        {
            var remainingAccountIds = transaction.Splits
                .Where(split => split.AccountId != deletedAccountId)
                .Select(split => split.AccountId)
                .Distinct()
                .ToList();

            return remainingAccountIds.Count == 1 ? remainingAccountIds[0] : null;
        }
    }
}
