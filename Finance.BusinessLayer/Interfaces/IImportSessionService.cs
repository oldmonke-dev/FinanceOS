using Finance.BusinessLayer.DTOs.ImportSessions;

namespace Finance.BusinessLayer.Interfaces
{
    public interface IImportSessionService
    {
        Task<ImportSessionDTO> CreateImportSessionAsync(CreateImportSessionDTO sessionDto, CancellationToken cancellationToken = default);

        Task<List<ImportSessionDTO>> GetImportSessionsAsync(CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> GetImportSessionAsync(Guid sessionId, CancellationToken cancellationToken = default);

        Task DeleteImportSessionAsync(Guid sessionId, CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> UpdateSourceAccountAsync(
            Guid sessionId,
            Guid? sourceAccountId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> UpdateTitleAsync(
            Guid sessionId,
            string? fileName,
            CancellationToken cancellationToken = default);

        Task<ImportSessionRowDTO> UpdateRowDestinationAccountAsync(
            Guid sessionId,
            Guid rowId,
            Guid? destinationAccountId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionRowDTO> UpdateRowLedgerInclusionAsync(
            Guid sessionId,
            Guid rowId,
            bool includeInLedger,
            CancellationToken cancellationToken = default);

        Task<AddImportSessionToLedgerResultDTO> AddSessionToLedgerAsync(
            Guid sessionId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> ReapplyLearningAsync(
            Guid sessionId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> RevertSessionLearningAsync(
            Guid sessionId,
            CancellationToken cancellationToken = default);

        Task<ImportSessionDTO> DeleteRowsAsync(
            Guid sessionId,
            IEnumerable<Guid> rowIds,
            CancellationToken cancellationToken = default);
    }
}
