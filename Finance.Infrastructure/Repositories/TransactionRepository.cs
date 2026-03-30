using Finance.Domain.Entities.Core;
using Finance.Domain.Interfaces;
using Finance.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Finance.Infrastructure.Repositories
{
    public class TransactionRepository : ITransactionRepository
    {
        private readonly AppDbContext _context;

        public TransactionRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<Transaction> CreateAsync(Transaction transaction, CancellationToken cancellationToken = default)
        {
            _context.Transactions.Add(transaction);
            await _context.SaveChangesAsync(cancellationToken);
            return transaction;
        }

        public async Task<List<Transaction>> CreateManyAsync(
            IEnumerable<Transaction> transactions,
            CancellationToken cancellationToken = default)
        {
            var transactionList = transactions.ToList();
            _context.Transactions.AddRange(transactionList);
            await _context.SaveChangesAsync(cancellationToken);
            return transactionList;
        }

        public async Task<List<Transaction>> GetTransactionsAsync(
            IEnumerable<Guid> accessibleAccountIds,
            Guid? accountId = null,
            CancellationToken cancellationToken = default)
        {
            var accessibleAccountIdSet = accessibleAccountIds
                .Where(accountIdValue => accountIdValue != Guid.Empty)
                .Distinct()
                .ToArray();

            var query = _context.Transactions
                .Include(transaction => transaction.Splits)
                .AsQueryable();

            if (accessibleAccountIdSet.Length == 0)
            {
                return new List<Transaction>();
            }

            query = query.Where(transaction =>
                transaction.Splits.Any(split => accessibleAccountIdSet.Contains(split.AccountId)));

            if (accountId.HasValue)
            {
                query = query.Where(transaction => transaction.Splits.Any(split => split.AccountId == accountId.Value));
            }

            return await query
                .OrderByDescending(transaction => transaction.TransactionDate)
                .ThenByDescending(transaction => transaction.CreatedAt)
                .ToListAsync(cancellationToken);
        }

        public async Task<Transaction?> GetByIdAsync(Guid transactionId, CancellationToken cancellationToken = default)
        {
            return await _context.Transactions
                .Include(transaction => transaction.Splits)
                .FirstOrDefaultAsync(transaction => transaction.Id == transactionId, cancellationToken);
        }

        public async Task<Transaction> UpdateAsync(Transaction transaction, CancellationToken cancellationToken = default)
        {
            await _context.SaveChangesAsync(cancellationToken);
            return transaction;
        }

        public async Task<bool> DeleteAsync(Guid transactionId, CancellationToken cancellationToken = default)
        {
            var transaction = await _context.Transactions
                .FirstOrDefaultAsync(item => item.Id == transactionId, cancellationToken);

            if (transaction is null)
            {
                return false;
            }

            _context.Transactions.Remove(transaction);
            await _context.SaveChangesAsync(cancellationToken);
            return true;
        }
    }
}
