using Finance.Domain.Entities.UserSession;

namespace Finance.Domain.Interfaces
{
    public interface IImportLearningRepository
    {
        Task<List<ImportLearningStat>> GetGlobalStatsAsync(CancellationToken cancellationToken = default);

        Task IncrementGlobalStatsAsync(
            Guid userId,
            IReadOnlyDictionary<(Guid DestinationAccountId, string FeatureKey), int> increments,
            CancellationToken cancellationToken = default);

        Task<int> DeleteGlobalStatsByDestinationAccountAsync(
            Guid destinationAccountId,
            CancellationToken cancellationToken = default);

        Task<List<ImportSessionLearningEntry>> GetSessionEntriesAsync(
            Guid sessionId,
            Guid userId,
            CancellationToken cancellationToken = default);

        Task ReplaceSessionRowEntriesAsync(
            Guid sessionId,
            Guid rowId,
            Guid userId,
            Guid destinationAccountId,
            IEnumerable<string> featureKeys,
            CancellationToken cancellationToken = default);

        Task DeleteSessionRowEntriesAsync(
            Guid sessionId,
            Guid rowId,
            Guid userId,
            CancellationToken cancellationToken = default);

        Task<int> DeleteSessionEntriesAsync(
            Guid sessionId,
            Guid userId,
            CancellationToken cancellationToken = default);

        Task PromoteSessionEntriesToGlobalAsync(
            Guid sessionId,
            Guid userId,
            CancellationToken cancellationToken = default);
    }
}
