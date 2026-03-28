using Finance.BusinessLayer.DTOs.ImportSessions;

namespace Finance.BusinessLayer.Interfaces
{   
    // Comment
    public interface IImportSessionService
    {
        Task<ImportSessionDTO> CreateImportSessionAsync(
            Guid userId,
            CreateImportSessionDTO sessionDto,
            CancellationToken cancellationToken = default);

        Task<List<ImportSessionDTO>> GetImportSessionsAsync(
            Guid userId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> GetImportSessionAsync(
            Guid userId,
            Guid sessionId,
            CancellationToken cancellationToken = default);

        Task DeleteImportSessionAsync(
            Guid userId,
            Guid sessionId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> UpdateSourceAccountAsync(
            Guid userId,
            Guid sessionId,
            Guid? sourceAccountId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> UpdateTitleAsync(
            Guid userId,
            Guid sessionId,
            string? fileName,
            CancellationToken cancellationToken = default);

        Task<ImportSessionRowDTO> UpdateRowDestinationAccountAsync(
            Guid userId,
            Guid sessionId,
            Guid rowId,
            Guid? destinationAccountId,
            CancellationToken cancellationToken = default);

        Task<AddImportSessionToLedgerResultDTO> AddSessionToLedgerAsync(
            Guid userId,
            Guid sessionId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> ReapplyLearningAsync(
            Guid userId,
            Guid sessionId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> RevertSessionLearningAsync(
            Guid userId,
            Guid sessionId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> DeleteRowsAsync(
            Guid userId,
            Guid sessionId,
            IEnumerable<Guid> rowIds,
            CancellationToken cancellationToken = default);
    }
}
