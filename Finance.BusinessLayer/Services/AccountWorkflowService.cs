using System.Globalization;
using System.Text.Json;
using Finance.BusinessLayer.DTOs;
using Finance.BusinessLayer.Interfaces;
using Finance.Domain.Entities.Core;
using Finance.Domain.Entities.UserSession;
using Finance.Domain.Enums;
using Microsoft.EntityFrameworkCore;

namespace Finance.BusinessLayer.Services
{
    public class AccountWorkflowService : IAccountWorkflowService
    {
        private readonly IAppDbContext _context;
        private readonly IAccountAccessService _accountAccessService;

        public AccountWorkflowService(IAppDbContext context, IAccountAccessService accountAccessService)
        {
            _context = context;
            _accountAccessService = accountAccessService;
        }

        public async Task<AccountDeletionResultDTO> DeleteAccountAsync(
            Guid accountId,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default)
        {
            var account = await _context.Accounts
                .Include(item => item.Children)
                .FirstOrDefaultAsync(item => item.Id == accountId, cancellationToken);

            if (account is null)
            {
                throw new KeyNotFoundException("Account was not found.");
            }

            if (account.IsCore)
            {
                throw new InvalidOperationException("Core accounts cannot be deleted.");
            }

            if (!isAdmin)
            {
                await _accountAccessService.EnsureCanManageAccountAsync(account.Id, userId, isAdmin, cancellationToken);
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
                remediationSession = BuildAccountDeletionSession(
                    userId,
                    account.Name,
                    accountId,
                    affectedTransactions);
                _context.ImportSessions.Add(remediationSession);
                _context.Transactions.RemoveRange(affectedTransactions);
            }

            await ClearImportReferencesAsync(accountId, cancellationToken);

            _context.Accounts.Remove(account);
            await _context.SaveChangesAsync(cancellationToken);

            return new AccountDeletionResultDTO
            {
                DeletedAccountId = accountId,
                CreatedImportSessionId = remediationSession?.Id,
                AffectedTransactionCount = affectedTransactions.Count,
            };
        }

        private async Task ClearImportReferencesAsync(Guid accountId, CancellationToken cancellationToken)
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

            var learningStats = await _context.ImportLearningStats
                .Where(item => item.DestinationAccountId == accountId)
                .ToListAsync(cancellationToken);

            if (learningStats.Count > 0)
            {
                _context.ImportLearningStats.RemoveRange(learningStats);
            }

            var sessionLearningEntries = await _context.ImportSessionLearningEntries
                .Where(item => item.DestinationAccountId == accountId)
                .ToListAsync(cancellationToken);

            if (sessionLearningEntries.Count > 0)
            {
                _context.ImportSessionLearningEntries.RemoveRange(sessionLearningEntries);
            }
        }

        private static ImportSession BuildAccountDeletionSession(
            Guid userId,
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
                var amount = deletedSplit.Side == SplitSide.Debit
                    ? -deletedSplit.Amount
                    : deletedSplit.Amount;

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
                });
            }

            return new ImportSession
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                FileName = $"Account removal - {deletedAccountName}",
                SourceAccountId = null,
                CreatedAt = DateTime.UtcNow,
                Label = "account_deletion_sessions",
                IsDeletable = false,
                Strategy = "bayesian_statistics",
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
