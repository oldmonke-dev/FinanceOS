using Finance.BusinessLayer.DTOs;

namespace Finance.BusinessLayer.Interfaces
{
    public interface IAccountWorkflowService
    {
        Task<AccountDeletionResultDTO> DeleteAccountAsync(
            Guid accountId,
            Guid userId,
            CancellationToken cancellationToken = default);
    }
}
