using Finance.Domain.Entities.Core;

namespace Finance.Domain.Interfaces
{
    public interface ITransactionRepository
    {
        Task<Transaction> CreateAsync(Transaction transaction, CancellationToken cancellationToken = default);

        Task<List<Transaction>> CreateManyAsync(
            IEnumerable<Transaction> transactions,
            CancellationToken cancellationToken = default);

        Task<List<Transaction>> GetTransactionsAsync(
            IEnumerable<Guid> accessibleAccountIds,
            Guid? accountId = null,
            CancellationToken cancellationToken = default);

        Task<Transaction?> GetByIdAsync(Guid transactionId, CancellationToken cancellationToken = default);

        Task<Transaction> UpdateAsync(Transaction transaction, CancellationToken cancellationToken = default);

        Task<bool> DeleteAsync(Guid transactionId, CancellationToken cancellationToken = default);
    }
}
