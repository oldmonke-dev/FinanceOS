using Finance.Domain.Entities.UserSession;

namespace Finance.Domain.Interfaces
{
    public interface IImportSessionRepository
    {
        Task<ImportSession> CreateAsync(ImportSession session, CancellationToken cancellationToken = default);

        Task<List<ImportSession>> GetByUserIdAsync(Guid userId, CancellationToken cancellationToken = default);

        Task<ImportSession?> GetByIdAsync(Guid sessionId, Guid userId, CancellationToken cancellationToken = default);

        Task<bool> DeleteAsync(Guid sessionId, Guid userId, CancellationToken cancellationToken = default);

        Task<bool> UpdateSourceAccountAsync(
            Guid sessionId,
            Guid userId,
            Guid? sourceAccountId,
            CancellationToken cancellationToken = default);

        Task<bool> UpdateTitleAsync(
            Guid sessionId,
            Guid userId,
            string? fileName,
            CancellationToken cancellationToken = default);

        Task<bool> UpdateRowDestinationAccountAsync(
            Guid sessionId,
            Guid rowId,
            Guid userId,
            Guid? destinationAccountId,
            CancellationToken cancellationToken = default);

        Task<int> DeleteRowsAsync(
            Guid sessionId,
            Guid userId,
            IEnumerable<Guid> rowIds,
            CancellationToken cancellationToken = default);

        Task SaveChangesAsync(CancellationToken cancellationToken = default);
    }
}
