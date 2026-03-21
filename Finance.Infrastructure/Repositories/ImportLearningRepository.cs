using Finance.Domain.Entities.UserSession;
using Finance.Domain.Interfaces;
using Finance.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Finance.Infrastructure.Repositories
{
    public class ImportLearningRepository : IImportLearningRepository
    {
        private readonly AppDbContext _context;

        public ImportLearningRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<List<ImportLearningStat>> GetGlobalStatsAsync(Guid userId, CancellationToken cancellationToken = default)
        {
            return await _context.ImportLearningStats
                .Where(item => item.UserId == userId)
                .ToListAsync(cancellationToken);
        }

        public async Task IncrementGlobalStatsAsync(
            Guid userId,
            IReadOnlyDictionary<(Guid DestinationAccountId, string FeatureKey), int> increments,
            CancellationToken cancellationToken = default)
        {
            if (increments.Count == 0)
            {
                return;
            }

            var destinationAccountIds = increments.Keys
                .Select(item => item.DestinationAccountId)
                .Distinct()
                .ToList();
            var featureKeys = increments.Keys
                .Select(item => item.FeatureKey)
                .Distinct(StringComparer.Ordinal)
                .ToList();

            var stats = await _context.ImportLearningStats
                .Where(item =>
                    item.UserId == userId
                    && destinationAccountIds.Contains(item.DestinationAccountId)
                    && featureKeys.Contains(item.FeatureKey))
                .ToListAsync(cancellationToken);

            foreach (var increment in increments)
            {
                var stat = stats.FirstOrDefault(item =>
                    item.DestinationAccountId == increment.Key.DestinationAccountId
                    && item.FeatureKey == increment.Key.FeatureKey);

                if (stat is null)
                {
                    stat = new ImportLearningStat
                    {
                        Id = Guid.NewGuid(),
                        UserId = userId,
                        DestinationAccountId = increment.Key.DestinationAccountId,
                        FeatureKey = increment.Key.FeatureKey,
                        Count = 0,
                    };

                    _context.ImportLearningStats.Add(stat);
                    stats.Add(stat);
                }

                stat.Count += increment.Value;
            }

            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task<List<ImportSessionLearningEntry>> GetSessionEntriesAsync(
            Guid sessionId,
            Guid userId,
            CancellationToken cancellationToken = default)
        {
            return await _context.ImportSessionLearningEntries
                .Include(item => item.ImportSession)
                .Where(item => item.ImportSessionId == sessionId && item.ImportSession.UserId == userId)
                .ToListAsync(cancellationToken);
        }

        public async Task ReplaceSessionRowEntriesAsync(
            Guid sessionId,
            Guid rowId,
            Guid userId,
            Guid destinationAccountId,
            IEnumerable<string> featureKeys,
            CancellationToken cancellationToken = default)
        {
            var existingEntries = await _context.ImportSessionLearningEntries
                .Include(item => item.ImportSession)
                .Where(item =>
                    item.ImportSessionId == sessionId
                    && item.ImportSessionRowId == rowId
                    && item.ImportSession.UserId == userId)
                .ToListAsync(cancellationToken);

            if (existingEntries.Count > 0)
            {
                _context.ImportSessionLearningEntries.RemoveRange(existingEntries);
            }

            var normalizedFeatureKeys = featureKeys
                .Where(featureKey => !string.IsNullOrWhiteSpace(featureKey))
                .Distinct(StringComparer.Ordinal)
                .ToList();

            foreach (var featureKey in normalizedFeatureKeys)
            {
                _context.ImportSessionLearningEntries.Add(new ImportSessionLearningEntry
                {
                    Id = Guid.NewGuid(),
                    ImportSessionId = sessionId,
                    ImportSessionRowId = rowId,
                    DestinationAccountId = destinationAccountId,
                    FeatureKey = featureKey,
                    CreatedAt = DateTime.UtcNow,
                });
            }

            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task DeleteSessionRowEntriesAsync(
            Guid sessionId,
            Guid rowId,
            Guid userId,
            CancellationToken cancellationToken = default)
        {
            var existingEntries = await _context.ImportSessionLearningEntries
                .Include(item => item.ImportSession)
                .Where(item =>
                    item.ImportSessionId == sessionId
                    && item.ImportSessionRowId == rowId
                    && item.ImportSession.UserId == userId)
                .ToListAsync(cancellationToken);

            if (existingEntries.Count == 0)
            {
                return;
            }

            _context.ImportSessionLearningEntries.RemoveRange(existingEntries);
            await _context.SaveChangesAsync(cancellationToken);
        }

        public async Task<int> DeleteSessionEntriesAsync(
            Guid sessionId,
            Guid userId,
            CancellationToken cancellationToken = default)
        {
            var entries = await _context.ImportSessionLearningEntries
                .Include(item => item.ImportSession)
                .Where(item => item.ImportSessionId == sessionId && item.ImportSession.UserId == userId)
                .ToListAsync(cancellationToken);

            if (entries.Count == 0)
            {
                return 0;
            }

            _context.ImportSessionLearningEntries.RemoveRange(entries);
            await _context.SaveChangesAsync(cancellationToken);
            return entries.Count;
        }

        public async Task PromoteSessionEntriesToGlobalAsync(
            Guid sessionId,
            Guid userId,
            CancellationToken cancellationToken = default)
        {
            var entries = await _context.ImportSessionLearningEntries
                .Include(item => item.ImportSession)
                .Where(item => item.ImportSessionId == sessionId && item.ImportSession.UserId == userId)
                .ToListAsync(cancellationToken);

            if (entries.Count == 0)
            {
                return;
            }

            var globalStats = await _context.ImportLearningStats
                .Where(item => item.UserId == userId)
                .ToListAsync(cancellationToken);

            foreach (var group in entries.GroupBy(item => new { item.DestinationAccountId, item.FeatureKey }))
            {
                var stat = globalStats.FirstOrDefault(item =>
                    item.DestinationAccountId == group.Key.DestinationAccountId
                    && item.FeatureKey == group.Key.FeatureKey);

                if (stat is null)
                {
                    stat = new ImportLearningStat
                    {
                        Id = Guid.NewGuid(),
                        UserId = userId,
                        DestinationAccountId = group.Key.DestinationAccountId,
                        FeatureKey = group.Key.FeatureKey,
                        Count = 0,
                    };

                    _context.ImportLearningStats.Add(stat);
                    globalStats.Add(stat);
                }

                stat.Count += group.Count();
            }

            _context.ImportSessionLearningEntries.RemoveRange(entries);
            await _context.SaveChangesAsync(cancellationToken);
        }
    }
}
