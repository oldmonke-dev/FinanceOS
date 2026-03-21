using Finance.BusinessLayer.DTOs.Transactions;

namespace Finance.BusinessLayer.Interfaces
{
    public interface ITransactionService
    {
        Task<TransactionDTO> CreateTransactionAsync(CreateTransactionDTO transactionDto, CancellationToken cancellationToken = default);

        Task<List<TransactionDTO>> GetTransactionsAsync(Guid? accountId = null, CancellationToken cancellationToken = default);

        Task<TransactionDTO> UpdateTransactionAsync(Guid transactionId, UpdateTransactionDTO transactionDto, CancellationToken cancellationToken = default);

        Task DeleteTransactionAsync(Guid transactionId, CancellationToken cancellationToken = default);
    }
}
