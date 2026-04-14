using Finance.BusinessLayer.DTOs.ImportSessions;

namespace Finance.BusinessLayer.Interfaces
{   
    // Comment
    public interface IImportSessionService
    {
        Task<ImportSessionDTO> CreateImportSessionAsync(
            Guid userId,
            bool isAdmin,
            CreateImportSessionDTO sessionDto,
            CancellationToken cancellationToken = default);

        Task<List<ImportSessionDTO>> GetImportSessionsAsync(
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> GetImportSessionAsync(
            Guid userId,
            bool isAdmin,
            Guid sessionId,
            CancellationToken cancellationToken = default);

        Task DeleteImportSessionAsync(
            Guid userId,
            Guid sessionId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> UpdateSourceAccountAsync(
            Guid userId,
            bool isAdmin,
            Guid sessionId,
            Guid? sourceAccountId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> UpdateTitleAsync(
            Guid userId,
            bool isAdmin,
            Guid sessionId,
            string? fileName,
            CancellationToken cancellationToken = default);

        Task<ImportSessionRowDTO> UpdateRowDestinationAccountAsync(
            Guid userId,
            bool isAdmin,
            Guid sessionId,
            Guid rowId,
            Guid? destinationAccountId,
            CancellationToken cancellationToken = default);

        Task<AddImportSessionToLedgerResultDTO> AddSessionToLedgerAsync(
            Guid userId,
            bool isAdmin,
            Guid sessionId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> ReapplyLearningAsync(
            Guid userId,
            bool isAdmin,
            Guid sessionId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> RevertSessionLearningAsync(
            Guid userId,
            bool isAdmin,
            Guid sessionId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> DeleteRowsAsync(
            Guid userId,
            bool isAdmin,
            Guid sessionId,
            IEnumerable<Guid> rowIds,
            CancellationToken cancellationToken = default);
    }
}
