using Finance.BusinessLayer.DTOs;

namespace Finance.BusinessLayer.Interfaces
{
    public interface IAccountWorkflowService
    {
        Task<AccountDeletionResultDTO> DeleteAccountAsync(
            Guid accountId,
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default);
    }
}
