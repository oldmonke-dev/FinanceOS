using Finance.BusinessLayer.DTOs.Transactions;

namespace Finance.BusinessLayer.Interfaces
{
    public interface ITransactionService
    {
        Task<TransactionDTO> CreateTransactionAsync(
            Guid userId,
            bool isAdmin,
            CreateTransactionDTO transactionDto,
            CancellationToken cancellationToken = default);

        Task<List<TransactionDTO>> GetTransactionsAsync(Guid userId, bool isAdmin, Guid? accountId = null, CancellationToken cancellationToken = default);

        Task<TransactionDTO> UpdateTransactionAsync(
            Guid userId,
            bool isAdmin,
            Guid transactionId,
            UpdateTransactionDTO transactionDto,
            CancellationToken cancellationToken = default);

        Task DeleteTransactionAsync(
            Guid userId,
            bool isAdmin,
            Guid transactionId,
            CancellationToken cancellationToken = default);
    }
}
