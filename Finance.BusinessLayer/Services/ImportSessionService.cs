using System.Globalization;
using System.Text.Json;
using Finance.BusinessLayer.DTOs.ImportSessions;
using Finance.BusinessLayer.Interfaces;
using Finance.Domain.Entities.Core;
using Finance.Domain.Entities.UserSession;
using Finance.Domain.Interfaces;

namespace Finance.BusinessLayer.Services
{
    public class ImportSessionService : IImportSessionService
    {
        private const string PriorFeatureKey = "__prior__";
        private static readonly HashSet<string> AllowedLabels = new(StringComparer.OrdinalIgnoreCase)
        {
            "user_imports",
            "user_import_chunked",
            "account_deletion_sessions",
        };

        private readonly IAccountRepository _accountRepository;
        private readonly IImportLearningRepository _importLearningRepository;
        private readonly IImportSessionRepository _importSessionRepository;
        private readonly ITransactionRepository _transactionRepository;

        public ImportSessionService(
            IAccountRepository accountRepository,
            IImportLearningRepository importLearningRepository,
            IImportSessionRepository importSessionRepository,
            ITransactionRepository transactionRepository)
        {
            _accountRepository = accountRepository;
            _importLearningRepository = importLearningRepository;
            _importSessionRepository = importSessionRepository;
            _transactionRepository = transactionRepository;
        }

        public async Task<ImportSessionDTO> CreateImportSessionAsync(
            Guid userId,
            CreateImportSessionDTO sessionDto,
            CancellationToken cancellationToken = default)
        {
            ValidateSession(sessionDto);

            var accountIdsToValidate = new List<Guid>();

            if (sessionDto.SourceAccountId.HasValue)
            {
                accountIdsToValidate.Add(sessionDto.SourceAccountId.Value);
            }

            accountIdsToValidate.AddRange(
                sessionDto.Rows
                    .Where(row => row.DestinationAccountId.HasValue)
                    .Select(row => row.DestinationAccountId!.Value));

            await ValidateAccountsExistAsync(accountIdsToValidate, cancellationToken);

            var normalizedLabel = NormalizeLabel(sessionDto.Label);

            var session = new ImportSession
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                FileName = string.IsNullOrWhiteSpace(sessionDto.FileName) ? null : sessionDto.FileName.Trim(),
                SourceAccountId = sessionDto.SourceAccountId,
                CreatedAt = DateTime.UtcNow,
                Label = normalizedLabel,
                IsDeletable = !string.Equals(normalizedLabel, "account_deletion_sessions", StringComparison.Ordinal),
                Strategy = string.IsNullOrWhiteSpace(sessionDto.Strategy)
                    ? "bayesian_statistics"
                    : sessionDto.Strategy.Trim(),
                IsArchived = sessionDto.IsArchived,
                Status = string.IsNullOrWhiteSpace(sessionDto.Status) ? "Active" : sessionDto.Status.Trim(),
                ColumnMappingsJson = SerializeColumnMappings(sessionDto.ColumnMappings),
                Rows = sessionDto.Rows.Select(row => new ImportSessionRow
                {
                    Id = Guid.NewGuid(),
                    RowIndex = row.RowIndex,
                    ValuesJson = SerializeValues(row.Values),
                    DestinationAccountId = row.DestinationAccountId,
                    DestinationAccountError = string.IsNullOrWhiteSpace(row.DestinationAccountError)
                        ? null
                        : row.DestinationAccountError.Trim(),
                    AddedToLedgerAt = row.AddedToLedgerAt,
                    PostedTransactionId = row.PostedTransactionId,
                    MappingSource = row.DestinationAccountId.HasValue ? "seeded" : "none",
                }).ToList(),
            };

            UpdateSessionLifecycleState(session);

            var created = await _importSessionRepository.CreateAsync(session, cancellationToken);
            var loaded = await _importSessionRepository.GetByIdAsync(created.Id, userId, cancellationToken)
                ?? throw new InvalidOperationException("Created import session could not be reloaded.");

            return MapSession(loaded);
        }

        public async Task<List<ImportSessionDTO>> GetImportSessionsAsync(Guid userId, CancellationToken cancellationToken = default)
        {
            var sessions = await _importSessionRepository.GetByUserIdAsync(userId, cancellationToken);
            return sessions.Select(MapSession).ToList();
        }

        public async Task<ImportSessionDTO> GetImportSessionAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default)
        {
            var session = await _importSessionRepository.GetByIdAsync(sessionId, userId, cancellationToken);

            if (session is null)
            {
                throw new KeyNotFoundException("Import session was not found.");
            }

            return MapSession(session);
        }

        public async Task DeleteImportSessionAsync(Guid userId, Guid sessionId, CancellationToken cancellationToken = default)
        {
            var session = await _importSessionRepository.GetByIdAsync(sessionId, userId, cancellationToken);

            if (session is null)
            {
                throw new KeyNotFoundException("Import session was not found.");
            }

            if (!session.IsDeletable)
            {
                throw new InvalidOperationException("This import session cannot be deleted.");
            }

            // Session-local learning must be discarded when the review session is deleted.
            // Global Bayesian stats are only promoted during posting, never during delete.
            await _importLearningRepository.DeleteSessionEntriesAsync(
                sessionId,
                userId,
                cancellationToken);

            var deleted = await _importSessionRepository.DeleteAsync(sessionId, userId, cancellationToken);

            if (!deleted)
            {
                throw new KeyNotFoundException("Import session was not found.");
            }
        }

        public async Task<ImportSessionDTO> UpdateSourceAccountAsync(
            Guid userId,
            Guid sessionId,
            Guid? sourceAccountId,
            CancellationToken cancellationToken = default)
        {
            if (sourceAccountId.HasValue)
            {
                await ValidateAccountsExistAsync(new[] { sourceAccountId.Value }, cancellationToken);
            }

            var updated = await _importSessionRepository.UpdateSourceAccountAsync(
                sessionId,
                userId,
                sourceAccountId,
                cancellationToken);

            if (!updated)
            {
                throw new KeyNotFoundException("Import session was not found.");
            }

            var session = await _importSessionRepository.GetByIdAsync(sessionId, userId, cancellationToken)
                ?? throw new KeyNotFoundException("Import session was not found.");

            UpdateSessionLifecycleState(session);
            await _importSessionRepository.SaveChangesAsync(cancellationToken);

            return MapSession(session);
        }

        public async Task<ImportSessionDTO> UpdateTitleAsync(
            Guid userId,
            Guid sessionId,
            string? fileName,
            CancellationToken cancellationToken = default)
        {
            var normalizedFileName = string.IsNullOrWhiteSpace(fileName) ? null : fileName.Trim();

            var updated = await _importSessionRepository.UpdateTitleAsync(
                sessionId,
                userId,
                normalizedFileName,
                cancellationToken);

            if (!updated)
            {
                throw new KeyNotFoundException("Import session was not found.");
            }

            var session = await _importSessionRepository.GetByIdAsync(sessionId, userId, cancellationToken)
                ?? throw new KeyNotFoundException("Import session was not found.");

            UpdateSessionLifecycleState(session);
            await _importSessionRepository.SaveChangesAsync(cancellationToken);

            return MapSession(session);
        }

        public async Task<ImportSessionRowDTO> UpdateRowDestinationAccountAsync(
            Guid userId,
            Guid sessionId,
            Guid rowId,
            Guid? destinationAccountId,
            CancellationToken cancellationToken = default)
        {
            if (destinationAccountId.HasValue)
            {
                await ValidateAccountsExistAsync(new[] { destinationAccountId.Value }, cancellationToken);
            }

            var updated = await _importSessionRepository.UpdateRowDestinationAccountAsync(
                sessionId,
                rowId,
                userId,
                destinationAccountId,
                cancellationToken);

            if (!updated)
            {
                throw new KeyNotFoundException("Import session row was not found.");
            }

            var session = await _importSessionRepository.GetByIdAsync(sessionId, userId, cancellationToken)
                ?? throw new KeyNotFoundException("Import session was not found.");

            var row = session.Rows.FirstOrDefault(item => item.Id == rowId)
                ?? throw new KeyNotFoundException("Import session row was not found.");

            row.MappingSource = destinationAccountId.HasValue ? "manual" : "none";

            if (destinationAccountId.HasValue)
            {
                var columnMappings = DeserializeColumnMappings(session.ColumnMappingsJson);
                var featureKeys = ExtractLearningFeatureKeys(session, row, columnMappings);
                await _importLearningRepository.ReplaceSessionRowEntriesAsync(
                    sessionId,
                    rowId,
                    userId,
                    destinationAccountId.Value,
                    featureKeys.Append(PriorFeatureKey),
                    cancellationToken);
            }
            else
            {
                await _importLearningRepository.DeleteSessionRowEntriesAsync(
                    sessionId,
                    rowId,
                    userId,
                    cancellationToken);
            }

            UpdateSessionLifecycleState(session);
            await _importSessionRepository.SaveChangesAsync(cancellationToken);

            return MapRow(row);
        }

        public async Task<AddImportSessionToLedgerResultDTO> AddSessionToLedgerAsync(
            Guid userId,
            Guid sessionId,
            CancellationToken cancellationToken = default)
        {
            var session = await _importSessionRepository.GetByIdAsync(sessionId, userId, cancellationToken)
                ?? throw new KeyNotFoundException("Import session was not found.");

            if (!session.SourceAccountId.HasValue || session.SourceAccountId.Value == Guid.Empty)
            {
                throw new InvalidOperationException("Import session must have a valid source account before posting to the ledger.");
            }

            var includedRows = session.Rows
                .Where(row =>
                    row.AddedToLedgerAt is null
                    && row.DestinationAccountId.HasValue
                    && row.DestinationAccountId.Value != Guid.Empty)
                .OrderBy(row => row.RowIndex)
                .ToList();

            if (includedRows.Count == 0)
            {
                throw new InvalidOperationException(
                    "Import session does not contain any destination-tagged rows ready for the ledger.");
            }

            var accountIdsToValidate = includedRows
                .Select(row => row.DestinationAccountId!.Value)
                .Append(session.SourceAccountId.Value);

            await ValidateAccountsExistAsync(accountIdsToValidate, cancellationToken);

            var columnMappings = DeserializeColumnMappings(session.ColumnMappingsJson);
            var rowTransactions = includedRows
                .Select(row => new
                {
                    Row = row,
                    Transaction = BuildImportedTransaction(session, row, columnMappings),
                })
                .ToList();

            var createdTransactions = await _transactionRepository.CreateManyAsync(
                rowTransactions.Select(item => item.Transaction),
                cancellationToken);

            var createdTransactionIdByRowId = rowTransactions.ToDictionary(
                item => item.Row.Id,
                item => item.Transaction.Id);

            var postedAt = DateTime.UtcNow;
            foreach (var row in includedRows)
            {
                row.AddedToLedgerAt = postedAt;
                row.PostedTransactionId = createdTransactionIdByRowId[row.Id];
            }

            await PromoteIncludedRowsToGlobalLearningAsync(
                userId,
                session,
                includedRows,
                columnMappings,
                cancellationToken);
            await _importLearningRepository.DeleteSessionEntriesAsync(sessionId, userId, cancellationToken);

            UpdateSessionLifecycleState(session);
            await _importSessionRepository.SaveChangesAsync(cancellationToken);

            return new AddImportSessionToLedgerResultDTO
            {
                SessionId = session.Id,
                CreatedTransactionCount = createdTransactions.Count,
                SkippedRowCount = session.Rows.Count - createdTransactions.Count,
                TransactionIds = createdTransactions.Select(transaction => transaction.Id).ToList(),
                SessionArchived = session.IsArchived,
                SessionStatus = session.Status,
            };
        }

        public async Task<ImportSessionDTO> ReapplyLearningAsync(
            Guid userId,
            Guid sessionId,
            CancellationToken cancellationToken = default)
        {
            var session = await _importSessionRepository.GetByIdAsync(sessionId, userId, cancellationToken)
                ?? throw new KeyNotFoundException("Import session was not found.");

            if (session.IsArchived)
            {
                throw new InvalidOperationException("Archived import sessions cannot be rescored.");
            }

            var candidateAccounts = await _accountRepository.GetAllAccountsAsync();
            var candidateAccountIds = candidateAccounts
                .Select(account => account.Id)
                .Where(accountId => accountId != session.SourceAccountId)
                .Distinct()
                .ToList();

            if (candidateAccountIds.Count == 0)
            {
                return MapSession(session);
            }

            var columnMappings = DeserializeColumnMappings(session.ColumnMappingsJson);
            var globalStats = await _importLearningRepository.GetGlobalStatsAsync(userId, cancellationToken);
            var sessionEntries = await _importLearningRepository.GetSessionEntriesAsync(sessionId, userId, cancellationToken);
            var effectiveStats = BuildEffectiveLearningCounts(globalStats, sessionEntries);

            foreach (var row in session.Rows
                .Where(item => item.AddedToLedgerAt is null && item.MappingSource != "manual"))
            {
                var featureKeys = ExtractLearningFeatureKeys(session, row, columnMappings);
                var bestDestinationAccountId = ScoreBestDestinationAccountId(
                    featureKeys,
                    candidateAccountIds,
                    effectiveStats);

                row.DestinationAccountId = bestDestinationAccountId;
                row.DestinationAccountError = null;
                row.MappingSource = bestDestinationAccountId.HasValue ? "learning" : "none";
            }

            UpdateSessionLifecycleState(session);
            await _importSessionRepository.SaveChangesAsync(cancellationToken);

            var updatedSession = await _importSessionRepository.GetByIdAsync(sessionId, userId, cancellationToken)
                ?? throw new KeyNotFoundException("Import session was not found.");

            return MapSession(updatedSession);
        }

        public async Task<ImportSessionDTO> RevertSessionLearningAsync(
            Guid userId,
            Guid sessionId,
            CancellationToken cancellationToken = default)
        {
            var session = await _importSessionRepository.GetByIdAsync(sessionId, userId, cancellationToken)
                ?? throw new KeyNotFoundException("Import session was not found.");

            if (session.IsArchived)
            {
                throw new InvalidOperationException("Archived import sessions cannot revert session learning.");
            }

            await _importLearningRepository.DeleteSessionEntriesAsync(sessionId, userId, cancellationToken);

            foreach (var row in session.Rows.Where(item => item.MappingSource == "learning" && item.AddedToLedgerAt is null))
            {
                row.DestinationAccountId = null;
                row.DestinationAccountError = null;
                row.MappingSource = "none";
            }

            UpdateSessionLifecycleState(session);
            await _importSessionRepository.SaveChangesAsync(cancellationToken);

            var updatedSession = await _importSessionRepository.GetByIdAsync(sessionId, userId, cancellationToken)
                ?? throw new KeyNotFoundException("Import session was not found.");

            return MapSession(updatedSession);
        }

        public async Task<ImportSessionDTO> DeleteRowsAsync(
            Guid userId,
            Guid sessionId,
            IEnumerable<Guid> rowIds,
            CancellationToken cancellationToken = default)
        {
            var deletedCount = await _importSessionRepository.DeleteRowsAsync(
                sessionId,
                userId,
                rowIds,
                cancellationToken);

            if (deletedCount == 0)
            {
                throw new KeyNotFoundException("No import session rows were found.");
            }

            var session = await _importSessionRepository.GetByIdAsync(sessionId, userId, cancellationToken)
                ?? throw new KeyNotFoundException("Import session was not found.");

            UpdateSessionLifecycleState(session);
            await _importSessionRepository.SaveChangesAsync(cancellationToken);

            return MapSession(session);
        }

        private async Task ValidateAccountsExistAsync(
            IEnumerable<Guid> accountIds,
            CancellationToken cancellationToken)
        {
            var requestedAccountIds = accountIds
                .Where(accountId => accountId != Guid.Empty)
                .Distinct()
                .ToArray();

            if (requestedAccountIds.Length == 0)
            {
                return;
            }

            var existingAccountIds = await _accountRepository.GetExistingAccountIdsAsync(requestedAccountIds, cancellationToken);
            var missingAccountIds = requestedAccountIds
                .Where(accountId => !existingAccountIds.Contains(accountId))
                .ToArray();

            if (missingAccountIds.Length > 0)
            {
                throw new InvalidOperationException($"One or more accounts do not exist: {string.Join(", ", missingAccountIds)}");
            }
        }

        private static void ValidateSession(CreateImportSessionDTO sessionDto)
        {
            if (sessionDto.Rows.Count == 0)
            {
                throw new InvalidOperationException("An import session must contain at least one row.");
            }

            if (sessionDto.Rows.Any(row => row.RowIndex < 0))
            {
                throw new InvalidOperationException("Row indexes must be zero or greater.");
            }

            if (sessionDto.Rows.Any(row => row.Values is null))
            {
                throw new InvalidOperationException("Each import session row must contain values.");
            }

            if (!AllowedLabels.Contains(NormalizeLabel(sessionDto.Label)))
            {
                throw new InvalidOperationException("Import session label is not supported.");
            }
        }

        private static string NormalizeLabel(string? label)
        {
            return string.IsNullOrWhiteSpace(label) ? "user_imports" : label.Trim().ToLowerInvariant();
        }

        private static string SerializeColumnMappings(Dictionary<int, string> columnMappings)
        {
            return JsonSerializer.Serialize(columnMappings ?? new Dictionary<int, string>());
        }

        private static string SerializeValues(List<string> values)
        {
            return JsonSerializer.Serialize(values ?? new List<string>());
        }

        private static Dictionary<int, string> DeserializeColumnMappings(string? json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                return new Dictionary<int, string>();
            }

            return JsonSerializer.Deserialize<Dictionary<int, string>>(json)
                ?? new Dictionary<int, string>();
        }

        private static List<string> DeserializeValues(string? json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                return new List<string>();
            }

            return JsonSerializer.Deserialize<List<string>>(json)
                ?? new List<string>();
        }

        private static ImportSessionDTO MapSession(ImportSession session)
        {
            return new ImportSessionDTO
            {
                Id = session.Id,
                CreatedAt = session.CreatedAt,
                UserId = session.UserId,
                CreatedByUserName = session.User?.DisplayName ?? session.UserId.ToString(),
                FileName = session.FileName,
                SourceAccountId = session.SourceAccountId,
                SourceAccountName = session.SourceAccount?.Name,
                Label = session.Label,
                IsDeletable = session.IsDeletable,
                Strategy = session.Strategy,
                IsArchived = session.IsArchived,
                Status = session.Status,
                ColumnMappings = DeserializeColumnMappings(session.ColumnMappingsJson),
                Rows = session.Rows
                    .OrderBy(row => row.RowIndex)
                    .Select(MapRow)
                    .ToList(),
            };
        }

        private static ImportSessionRowDTO MapRow(ImportSessionRow row)
        {
            return new ImportSessionRowDTO
            {
                Id = row.Id,
                RowIndex = row.RowIndex,
                Values = DeserializeValues(row.ValuesJson),
                DestinationAccountId = row.DestinationAccountId,
                DestinationAccountError = row.DestinationAccountError,
                MappingSource = row.MappingSource,
                AddedToLedgerAt = row.AddedToLedgerAt,
                PostedTransactionId = row.PostedTransactionId,
            };
        }

        private static void UpdateSessionLifecycleState(ImportSession session)
        {
            if (session.Rows.Count == 0)
            {
                session.IsArchived = true;
                session.Status = "Archived";
                return;
            }

            var hasPendingLedgerRows = session.Rows.Any(row => row.AddedToLedgerAt is null);
            if (!hasPendingLedgerRows)
            {
                session.IsArchived = true;
                session.Status = "Done";
                return;
            }

            session.IsArchived = false;
            session.Status = "Active";
        }

        private static Transaction BuildImportedTransaction(
            ImportSession session,
            ImportSessionRow row,
            Dictionary<int, string> columnMappings)
        {
            var values = DeserializeValues(row.ValuesJson);
            var transactionDate = ResolveTransactionDate(values, columnMappings, row.RowIndex);
            var amount = ResolveTransactionAmount(values, columnMappings, row.RowIndex);
            var description = ResolveMappedValue(values, columnMappings, "description");
            var reference = ResolveMappedValue(values, columnMappings, "reference");
            var memo = ResolveMappedValue(values, columnMappings, "memo");

            return new Transaction
            {
                Id = Guid.NewGuid(),
                TransactionDate = transactionDate,
                Description = string.IsNullOrWhiteSpace(description)
                    ? $"Imported row {row.RowIndex + 1}"
                    : description.Trim(),
                ReferenceNumber = string.IsNullOrWhiteSpace(reference) ? null : reference.Trim(),
                CreatedAt = DateTime.UtcNow,
                Splits = new List<Split>
                {
                    new()
                    {
                        Id = Guid.NewGuid(),
                        AccountId = session.SourceAccountId!.Value,
                        Amount = -amount,
                        Memo = string.IsNullOrWhiteSpace(memo) ? null : memo.Trim(),
                    },
                    new()
                    {
                        Id = Guid.NewGuid(),
                        AccountId = row.DestinationAccountId!.Value,
                        Amount = amount,
                        Memo = string.IsNullOrWhiteSpace(memo) ? null : memo.Trim(),
                    },
                },
            };
        }

        private static DateTime ResolveTransactionDate(
            List<string> values,
            Dictionary<int, string> columnMappings,
            int rowIndex)
        {
            var rawValue = ResolveMappedValue(values, columnMappings, "date");
            if (string.IsNullOrWhiteSpace(rawValue))
            {
                throw new InvalidOperationException($"Imported row {rowIndex + 1} is missing a mapped date value.");
            }

            if (DateTime.TryParse(rawValue, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsedInvariant) ||
                DateTime.TryParse(rawValue, CultureInfo.CurrentCulture, DateTimeStyles.AssumeLocal, out parsedInvariant))
            {
                return parsedInvariant.Kind switch
                {
                    DateTimeKind.Utc => parsedInvariant,
                    DateTimeKind.Local => parsedInvariant.ToUniversalTime(),
                    _ => DateTime.SpecifyKind(parsedInvariant, DateTimeKind.Utc),
                };
            }

            throw new InvalidOperationException($"Imported row {rowIndex + 1} has an invalid date value: {rawValue}.");
        }

        private static decimal ResolveTransactionAmount(
            List<string> values,
            Dictionary<int, string> columnMappings,
            int rowIndex)
        {
            var amountColumnIndex = FindMappedColumnIndex(columnMappings, "amount");
            var negateAmountColumnIndex = FindMappedColumnIndex(columnMappings, "amount_negate");

            if (!amountColumnIndex.HasValue && !negateAmountColumnIndex.HasValue)
            {
                throw new InvalidOperationException("Import session must map either an amount or amount_negate column before posting to the ledger.");
            }

            var hasDepositValue = TryGetMappedDecimal(values, amountColumnIndex, out var depositAmount);
            var hasWithdrawalValue = TryGetMappedDecimal(values, negateAmountColumnIndex, out var withdrawalAmount);

            if (!hasDepositValue && !hasWithdrawalValue)
            {
                throw new InvalidOperationException($"Imported row {rowIndex + 1} is missing a mapped amount value.");
            }

            var amount = hasDepositValue && hasWithdrawalValue
                ? depositAmount - Math.Abs(withdrawalAmount)
                : hasDepositValue
                    ? depositAmount
                    : -Math.Abs(withdrawalAmount);

            if (amount == 0)
            {
                throw new InvalidOperationException(
                    $"Imported row {rowIndex + 1} resolved to zero after applying deposit and withdrawal columns and cannot be posted.");
            }

            return amount;
        }

        private static bool TryResolveTransactionAmount(
            List<string> values,
            Dictionary<int, string> columnMappings,
            out decimal amount)
        {
            amount = 0;

            var amountColumnIndex = FindMappedColumnIndex(columnMappings, "amount");
            var negateAmountColumnIndex = FindMappedColumnIndex(columnMappings, "amount_negate");

            if (!amountColumnIndex.HasValue && !negateAmountColumnIndex.HasValue)
            {
                return false;
            }

            var hasDepositValue = TryGetMappedDecimal(values, amountColumnIndex, out var depositAmount);
            var hasWithdrawalValue = TryGetMappedDecimal(values, negateAmountColumnIndex, out var withdrawalAmount);

            if (!hasDepositValue && !hasWithdrawalValue)
            {
                return false;
            }

            amount = hasDepositValue && hasWithdrawalValue
                ? depositAmount - Math.Abs(withdrawalAmount)
                : hasDepositValue
                    ? depositAmount
                    : -Math.Abs(withdrawalAmount);
            return amount != 0;
        }

        private static string? ResolveMappedValue(
            List<string> values,
            Dictionary<int, string> columnMappings,
            string fieldName)
        {
            var columnIndex = FindMappedColumnIndex(columnMappings, fieldName);
            if (!columnIndex.HasValue || columnIndex.Value < 0 || columnIndex.Value >= values.Count)
            {
                return null;
            }

            var value = values[columnIndex.Value];
            return string.IsNullOrWhiteSpace(value) ? null : value.Trim();
        }

        private static int? FindMappedColumnIndex(Dictionary<int, string> columnMappings, string fieldName)
        {
            foreach (var pair in columnMappings)
            {
                if (string.Equals(pair.Value, fieldName, StringComparison.OrdinalIgnoreCase))
                {
                    return pair.Key;
                }
            }

            return null;
        }

        private static bool TryParseDecimal(string value, out decimal amount)
        {
            var normalizedValue = value.Trim().Replace(",", string.Empty);

            return decimal.TryParse(
                    normalizedValue,
                    NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
                    CultureInfo.InvariantCulture,
                    out amount)
                || decimal.TryParse(
                    normalizedValue,
                    NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint,
                    CultureInfo.CurrentCulture,
                    out amount);
        }

        private static bool TryGetMappedDecimal(
            List<string> values,
            int? columnIndex,
            out decimal amount)
        {
            amount = 0;

            if (!columnIndex.HasValue || columnIndex.Value < 0 || columnIndex.Value >= values.Count)
            {
                return false;
            }

            var rawValue = values[columnIndex.Value];
            if (string.IsNullOrWhiteSpace(rawValue))
            {
                return false;
            }

            if (!TryParseDecimal(rawValue, out amount))
            {
                return false;
            }

            return true;
        }

        private async Task PromoteIncludedRowsToGlobalLearningAsync(
            Guid userId,
            ImportSession session,
            IEnumerable<ImportSessionRow> rows,
            Dictionary<int, string> columnMappings,
            CancellationToken cancellationToken)
        {
            var increments = new Dictionary<(Guid DestinationAccountId, string FeatureKey), int>();

            foreach (var row in rows)
            {
                if (!row.DestinationAccountId.HasValue)
                {
                    continue;
                }

                var featureKeys = ExtractLearningFeatureKeys(session, row, columnMappings)
                    .Append(PriorFeatureKey);

                foreach (var featureKey in featureKeys)
                {
                    var key = (row.DestinationAccountId.Value, featureKey);
                    increments[key] = (increments.TryGetValue(key, out var count) ? count : 0) + 1;
                }
            }

            if (increments.Count == 0)
            {
                return;
            }

            await _importLearningRepository.IncrementGlobalStatsAsync(
                userId,
                increments,
                cancellationToken);
        }

        private static Dictionary<Guid, Dictionary<string, int>> BuildEffectiveLearningCounts(
            IEnumerable<ImportLearningStat> globalStats,
            IEnumerable<ImportSessionLearningEntry> sessionEntries)
        {
            var counts = new Dictionary<Guid, Dictionary<string, int>>();

            foreach (var stat in globalStats)
            {
                if (!counts.TryGetValue(stat.DestinationAccountId, out var byFeature))
                {
                    byFeature = new Dictionary<string, int>(StringComparer.Ordinal);
                    counts[stat.DestinationAccountId] = byFeature;
                }

                byFeature[stat.FeatureKey] = (byFeature.TryGetValue(stat.FeatureKey, out var current) ? current : 0) + stat.Count;
            }

            foreach (var entry in sessionEntries)
            {
                if (!counts.TryGetValue(entry.DestinationAccountId, out var byFeature))
                {
                    byFeature = new Dictionary<string, int>(StringComparer.Ordinal);
                    counts[entry.DestinationAccountId] = byFeature;
                }

                byFeature[entry.FeatureKey] = (byFeature.TryGetValue(entry.FeatureKey, out var current) ? current : 0) + 1;
            }

            return counts;
        }

        private static Guid? ScoreBestDestinationAccountId(
            IReadOnlyCollection<string> featureKeys,
            IReadOnlyCollection<Guid> candidateAccountIds,
            IReadOnlyDictionary<Guid, Dictionary<string, int>> effectiveStats)
        {
            if (candidateAccountIds.Count == 0)
            {
                return null;
            }

            var totalExamples = candidateAccountIds.Sum(accountId =>
                effectiveStats.TryGetValue(accountId, out var byFeature)
                    && byFeature.TryGetValue(PriorFeatureKey, out var priorCount)
                        ? priorCount
                        : 0);

            if (totalExamples == 0)
            {
                return null;
            }

            var vocabulary = new HashSet<string>(
                effectiveStats.Values.SelectMany(byFeature => byFeature.Keys.Where(key => key != PriorFeatureKey)),
                StringComparer.Ordinal);
            var vocabularySize = Math.Max(1, vocabulary.Count);

            Guid? bestAccountId = null;
            double bestScore = double.NegativeInfinity;

            foreach (var candidateAccountId in candidateAccountIds)
            {
                effectiveStats.TryGetValue(candidateAccountId, out var byFeature);
                byFeature ??= new Dictionary<string, int>(StringComparer.Ordinal);

                var priorCount = byFeature.TryGetValue(PriorFeatureKey, out var priorValue) ? priorValue : 0;
                var featureTotal = byFeature
                    .Where(pair => pair.Key != PriorFeatureKey)
                    .Sum(pair => pair.Value);

                var score = Math.Log((priorCount + 1d) / (totalExamples + candidateAccountIds.Count));

                foreach (var featureKey in featureKeys)
                {
                    var featureCount = byFeature.TryGetValue(featureKey, out var current) ? current : 0;
                    score += Math.Log((featureCount + 1d) / (featureTotal + vocabularySize));
                }

                if (score > bestScore)
                {
                    bestScore = score;
                    bestAccountId = candidateAccountId;
                }
            }

            return bestAccountId;
        }

        private static IReadOnlyCollection<string> ExtractLearningFeatureKeys(
            ImportSession session,
            ImportSessionRow row,
            Dictionary<int, string> columnMappings)
        {
            var values = DeserializeValues(row.ValuesJson);
            var featureKeys = new HashSet<string>(StringComparer.Ordinal);

            if (session.SourceAccountId.HasValue && session.SourceAccountId.Value != Guid.Empty)
            {
                featureKeys.Add($"source:{session.SourceAccountId.Value:D}");
            }

            var description = ResolveMappedValue(values, columnMappings, "description");
            var reference = ResolveMappedValue(values, columnMappings, "reference");

            foreach (var token in TokenizeFeatureText(description))
            {
                featureKeys.Add($"desc:{token}");
            }

            foreach (var token in TokenizeFeatureText(reference))
            {
                featureKeys.Add($"ref:{token}");
            }

            if (TryResolveTransactionAmount(values, columnMappings, out var amount))
            {
                featureKeys.Add(amount < 0 ? "sign:negative" : "sign:positive");
                featureKeys.Add($"bucket:{ResolveAmountBucket(amount)}");
            }

            return featureKeys;
        }

        private static IEnumerable<string> TokenizeFeatureText(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                yield break;
            }

            var normalized = value.Trim().ToLowerInvariant();
            var parts = normalized.Split(new[] { ' ', '\t', '\r', '\n', '-', '_', '/', '\\', '.', ',', ':', ';', '#', '*', '(', ')' }, StringSplitOptions.RemoveEmptyEntries);

            foreach (var part in parts)
            {
                if (part.Length < 2)
                {
                    continue;
                }

                yield return part;
            }
        }

        private static string ResolveAmountBucket(decimal amount)
        {
            var absoluteAmount = Math.Abs(amount);

            if (absoluteAmount < 10)
            {
                return "0_10";
            }

            if (absoluteAmount < 50)
            {
                return "10_50";
            }

            if (absoluteAmount < 200)
            {
                return "50_200";
            }

            if (absoluteAmount < 1000)
            {
                return "200_1000";
            }

            return "1000_plus";
        }
    }
}
