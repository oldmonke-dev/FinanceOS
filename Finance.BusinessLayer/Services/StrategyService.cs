using Finance.BusinessLayer.DTOs.Strategies;
using Finance.BusinessLayer.Interfaces;
using Finance.Domain.Interfaces;

namespace Finance.BusinessLayer.Services
{
    public class StrategyService : IStrategyService
    {
        private readonly IAccountRepository _accountRepository;
        private readonly IImportLearningRepository _importLearningRepository;

        public StrategyService(
            IAccountRepository accountRepository,
            IImportLearningRepository importLearningRepository)
        {
            _accountRepository = accountRepository;
            _importLearningRepository = importLearningRepository;
        }

        public async Task<BayesianStrategyDTO> GetBayesianStrategyAsync(Guid userId, bool isAdmin, CancellationToken cancellationToken = default)
        {
            var accounts = await _accountRepository.GetAllAccountsAsync(userId, isAdmin);
            var accountIds = accounts.Select(account => account.Id).ToHashSet();
            var stats = (await _importLearningRepository.GetGlobalStatsAsync(cancellationToken))
                .Where(stat => accountIds.Contains(stat.DestinationAccountId))
                .ToList();

            var accountById = accounts.ToDictionary(account => account.Id);
            var pathById = new Dictionary<Guid, string>();

            string BuildPath(Guid accountId)
            {
                if (pathById.TryGetValue(accountId, out var cached))
                {
                    return cached;
                }

                if (!accountById.TryGetValue(accountId, out var account))
                {
                    return accountId.ToString();
                }

                var segments = new List<string>();
                var current = account;

                while (current is not null)
                {
                    segments.Insert(0, current.Name);
                    current =
                        current.ParentAccountId.HasValue
                        && accountById.TryGetValue(current.ParentAccountId.Value, out var parent)
                            ? parent
                            : null;
                }

                var path = string.Join(" / ", segments);
                pathById[accountId] = path;
                return path;
            }

            var grouped = stats
                .GroupBy(stat => stat.DestinationAccountId)
                .Select(group =>
                {
                    accountById.TryGetValue(group.Key, out var account);

                    return new BayesianMapGroupDTO
                    {
                        DestinationAccountId = group.Key,
                        DestinationAccountName = account?.Name ?? group.Key.ToString(),
                        DestinationAccountPath = BuildPath(group.Key),
                        DestinationAccountOwnerUserId = account?.OwnerUserId,
                        DestinationAccountOwnerDisplayName = account?.OwnerUser?.DisplayName,
                        DestinationAccountOwnerEmail = account?.OwnerUser?.Email,
                        TotalLearnedCount = group
                            .Where(stat => stat.FeatureKey == "__prior__")
                            .Sum(stat => stat.Count),
                        Entries = group
                            .Where(stat => stat.FeatureKey != "__prior__")
                            .OrderByDescending(stat => stat.Count)
                            .ThenBy(stat => stat.FeatureKey)
                            .Take(24)
                            .Select(stat => new BayesianMapEntryDTO
                            {
                                FeatureKey = stat.FeatureKey,
                                Count = stat.Count,
                            })
                            .ToList(),
                    };
                })
                .OrderByDescending(group => group.TotalLearnedCount)
                .ThenBy(group => group.DestinationAccountPath)
                .ToList();

            return new BayesianStrategyDTO
            {
                StrategyKey = "bayesian_statistics",
                LearnedFeatureCount = stats.Count,
                LearnedAccountCount = grouped.Count,
                MapGroups = grouped,
            };
        }

        public async Task<ImportBayesianTrainingResultDTO> ImportBayesianTrainingDataAsync(
            Guid userId,
            bool isAdmin,
            ImportBayesianTrainingDataDTO request,
            CancellationToken cancellationToken = default)
        {
            var accounts = await _accountRepository.GetAllAccountsAsync(userId, isAdmin);
            var accountByNormalizedPath = accounts.ToDictionary(
                account => NormalizeAccountPath(BuildPath(account, accounts)),
                account => account);

            var increments = new Dictionary<(Guid DestinationAccountId, string FeatureKey), int>();
            var missingAccountPaths = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var importedCount = 0;
            var skippedCount = 0;

            foreach (var example in request.Examples)
            {
                var normalizedSourcePath = NormalizeAccountPath(example.SourceAccountPath);
                var normalizedDestinationPath = NormalizeAccountPath(example.DestinationAccountPath);

                if (!accountByNormalizedPath.TryGetValue(normalizedSourcePath, out var sourceAccount))
                {
                    skippedCount += 1;
                    if (!string.IsNullOrWhiteSpace(example.SourceAccountPath))
                    {
                        missingAccountPaths.Add(example.SourceAccountPath);
                    }

                    continue;
                }

                if (!accountByNormalizedPath.TryGetValue(normalizedDestinationPath, out var destinationAccount))
                {
                    skippedCount += 1;
                    if (!string.IsNullOrWhiteSpace(example.DestinationAccountPath))
                    {
                        missingAccountPaths.Add(example.DestinationAccountPath);
                    }

                    continue;
                }

                var featureKeys = BuildFeatureKeys(
                    sourceAccount.Id,
                    example.Description,
                    example.Reference,
                    example.Memo,
                    example.Amount);

                foreach (var featureKey in featureKeys)
                {
                    var key = (destinationAccount.Id, featureKey);
                    increments[key] = (increments.TryGetValue(key, out var count) ? count : 0) + 1;
                }

                importedCount += 1;
            }

            await _importLearningRepository.IncrementGlobalStatsAsync(
                userId,
                increments,
                cancellationToken);

            return new ImportBayesianTrainingResultDTO
            {
                ImportedExampleCount = importedCount,
                SkippedExampleCount = skippedCount,
                MissingAccountPaths = missingAccountPaths.OrderBy(value => value).ToList(),
            };
        }

        public async Task DeleteBayesianLearningForAccountAsync(
            Guid userId,
            bool isAdmin,
            Guid destinationAccountId,
            CancellationToken cancellationToken = default)
        {
            if (destinationAccountId == Guid.Empty)
            {
                throw new InvalidOperationException("Destination account is required.");
            }

            if (!isAdmin)
            {
                throw new InvalidOperationException("Only admins can delete shared Bayesian learning.");
            }

            var deletedCount = await _importLearningRepository.DeleteGlobalStatsByDestinationAccountAsync(
                destinationAccountId,
                cancellationToken);

            if (deletedCount == 0)
            {
                throw new KeyNotFoundException("No Bayesian learning was found for that account.");
            }
        }

        private static string BuildPath(Finance.Domain.Entities.Core.Account account, IReadOnlyCollection<Finance.Domain.Entities.Core.Account> accounts)
        {
            var accountById = accounts.ToDictionary(item => item.Id);
            var segments = new List<string>();
            var current = account;

            while (current is not null)
            {
                segments.Insert(0, current.Name);
                current =
                    current.ParentAccountId.HasValue && accountById.TryGetValue(current.ParentAccountId.Value, out var parent)
                        ? parent
                        : null;
            }

            return string.Join(" / ", segments);
        }

        private static string NormalizeAccountPath(string? path)
        {
            if (string.IsNullOrWhiteSpace(path))
            {
                return string.Empty;
            }

            return string.Join(
                "/",
                path.Split(new[] { ':', '/', '\\' }, StringSplitOptions.RemoveEmptyEntries)
                    .Select(segment => segment.Trim().ToLowerInvariant()));
        }

        private static IReadOnlyCollection<string> BuildFeatureKeys(
            Guid sourceAccountId,
            string? description,
            string? reference,
            string? memo,
            decimal? amount)
        {
            var featureKeys = new HashSet<string>(StringComparer.Ordinal)
            {
                "__prior__",
                "include:true",
                $"source:{sourceAccountId:D}",
            };

            foreach (var token in Tokenize(description))
            {
                featureKeys.Add($"desc:{token}");
            }

            foreach (var token in Tokenize(reference))
            {
                featureKeys.Add($"ref:{token}");
            }

            foreach (var token in Tokenize(memo))
            {
                featureKeys.Add($"memo:{token}");
            }

            if (amount.HasValue && amount.Value != 0)
            {
                featureKeys.Add(amount.Value < 0 ? "sign:negative" : "sign:positive");
                featureKeys.Add($"bucket:{ResolveAmountBucket(amount.Value)}");
            }

            return featureKeys;
        }

        private static IEnumerable<string> Tokenize(string? value)
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
