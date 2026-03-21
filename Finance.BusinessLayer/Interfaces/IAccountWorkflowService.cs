using Finance.BusinessLayer.DTOs;

namespace Finance.BusinessLayer.Interfaces
{
    public interface IAccountWorkflowService
    {
        Task<AccountDeletionResultDTO> DeleteAccountAsync(Guid accountId, CancellationToken cancellationToken = default);
    }
}
