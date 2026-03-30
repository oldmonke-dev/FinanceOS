using Finance.BusinessLayer.DTOs.Transactions;
using Finance.BusinessLayer.Interfaces;
using Finance.Domain.Entities.Core;
using Finance.Domain.Enums;
using Finance.Domain.Interfaces;

namespace Finance.BusinessLayer.Services
{
    public class TransactionService : ITransactionService
    {
        private readonly IAccountRepository _accountRepository;
        private readonly IAccountAccessService _accountAccessService;
        private readonly ITransactionRepository _transactionRepository;

        public TransactionService(
            IAccountRepository accountRepository,
            IAccountAccessService accountAccessService,
            ITransactionRepository transactionRepository)
        {
            _accountRepository = accountRepository;
            _accountAccessService = accountAccessService;
            _transactionRepository = transactionRepository;
        }

        public async Task<TransactionDTO> CreateTransactionAsync(
            Guid userId,
            bool isAdmin,
            CreateTransactionDTO transactionDto,
            CancellationToken cancellationToken = default)
        {
            ValidateTransaction(transactionDto);

            var requestedAccountIds = transactionDto.Splits
                .Select(split => split.AccountId)
                .Distinct()
                .ToArray();

            var existingAccountIds = await _accountRepository.GetExistingAccountIdsAsync(requestedAccountIds, cancellationToken);
            var missingAccountIds = requestedAccountIds
                .Where(accountId => !existingAccountIds.Contains(accountId))
                .ToArray();

            if (missingAccountIds.Length > 0)
            {
                throw new InvalidOperationException($"One or more accounts do not exist: {string.Join(", ", missingAccountIds)}");
            }

            await _accountAccessService.EnsureCanPostAccountsAsync(
                requestedAccountIds,
                userId,
                isAdmin,
                cancellationToken);

            var transaction = new Transaction
            {
                Id = Guid.NewGuid(),
                TransactionDate = transactionDto.TransactionDate,
                Description = transactionDto.Description?.Trim() ?? string.Empty,
                ReferenceNumber = string.IsNullOrWhiteSpace(transactionDto.ReferenceNumber) ? null : transactionDto.ReferenceNumber.Trim(),
                CreatedAt = DateTime.UtcNow,
                Splits = transactionDto.Splits
                    .Select(split => new Split
                    {
                        Id = Guid.NewGuid(),
                        AccountId = split.AccountId,
                        Amount = Math.Abs(split.Amount),
                        Side = split.Side,
                        Memo = string.IsNullOrWhiteSpace(split.Memo) ? null : split.Memo.Trim()
                    })
                    .ToList()
            };

            var createdTransaction = await _transactionRepository.CreateAsync(transaction, cancellationToken);

            return MapTransaction(createdTransaction);
        }

        public async Task<List<TransactionDTO>> GetTransactionsAsync(
            Guid userId,
            bool isAdmin,
            Guid? accountId = null,
            CancellationToken cancellationToken = default)
        {
            if (accountId.HasValue)
            {
                await ValidateAccountsExistAsync(new[] { accountId.Value }, cancellationToken);
                await _accountAccessService.EnsureCanViewAccountAsync(accountId.Value, userId, isAdmin, cancellationToken);
            }

            var accessibleAccountIds = await _accountAccessService.GetViewableAccountIdsAsync(
                userId,
                isAdmin,
                cancellationToken);
            var transactions = await _transactionRepository.GetTransactionsAsync(
                accessibleAccountIds,
                accountId,
                cancellationToken);
            return transactions.Select(MapTransaction).ToList();
        }

        public async Task<TransactionDTO> UpdateTransactionAsync(
            Guid userId,
            bool isAdmin,
            Guid transactionId,
            UpdateTransactionDTO transactionDto,
            CancellationToken cancellationToken = default)
        {
            ValidateTransaction(transactionDto);

            var transaction = await _transactionRepository.GetByIdAsync(transactionId, cancellationToken);

            if (transaction is null)
            {
                throw new KeyNotFoundException("Transaction was not found.");
            }

            var requestedAccountIds = transactionDto.Splits
                .Select(split => split.AccountId)
                .Distinct()
                .ToArray();

            await ValidateAccountsExistAsync(requestedAccountIds, cancellationToken);
            await _accountAccessService.EnsureCanEditTransactionAsync(
                transaction,
                requestedAccountIds,
                userId,
                isAdmin,
                cancellationToken);

            var existingSplitIds = transaction.Splits.Select(split => split.Id).OrderBy(id => id).ToArray();
            var requestedSplitIds = transactionDto.Splits.Select(split => split.Id).OrderBy(id => id).ToArray();

            if (!existingSplitIds.SequenceEqual(requestedSplitIds))
            {
                throw new InvalidOperationException("Transaction splits did not match the existing transaction.");
            }

            transaction.Description = transactionDto.Description?.Trim() ?? string.Empty;
            transaction.ReferenceNumber = string.IsNullOrWhiteSpace(transactionDto.ReferenceNumber)
                ? null
                : transactionDto.ReferenceNumber.Trim();

            foreach (var split in transaction.Splits)
            {
                var updatedSplit = transactionDto.Splits.First(item => item.Id == split.Id);
                split.AccountId = updatedSplit.AccountId;
                split.Amount = Math.Abs(updatedSplit.Amount);
                split.Side = updatedSplit.Side;
                split.Memo = string.IsNullOrWhiteSpace(updatedSplit.Memo) ? null : updatedSplit.Memo.Trim();
            }

            var updatedTransaction = await _transactionRepository.UpdateAsync(transaction, cancellationToken);
            return MapTransaction(updatedTransaction);
        }

        public async Task DeleteTransactionAsync(
            Guid userId,
            bool isAdmin,
            Guid transactionId,
            CancellationToken cancellationToken = default)
        {
            var transaction = await _transactionRepository.GetByIdAsync(transactionId, cancellationToken);

            if (transaction is null)
            {
                throw new KeyNotFoundException("Transaction was not found.");
            }

            await _accountAccessService.EnsureCanDeleteTransactionAsync(
                transaction,
                userId,
                isAdmin,
                cancellationToken);

            var deleted = await _transactionRepository.DeleteAsync(transactionId, cancellationToken);

            if (!deleted)
            {
                throw new KeyNotFoundException("Transaction was not found.");
            }
        }

        private async Task ValidateAccountsExistAsync(
            IEnumerable<Guid> accountIds,
            CancellationToken cancellationToken)
        {
            var requestedAccountIds = accountIds
                .Where(accountId => accountId != Guid.Empty)
                .Distinct()
                .ToArray();

            if (requestedAccountIds.Length == 0)
            {
                return;
            }

            var existingAccountIds = await _accountRepository.GetExistingAccountIdsAsync(requestedAccountIds, cancellationToken);
            var missingAccountIds = requestedAccountIds
                .Where(accountId => !existingAccountIds.Contains(accountId))
                .ToArray();

            if (missingAccountIds.Length > 0)
            {
                throw new InvalidOperationException($"One or more accounts do not exist: {string.Join(", ", missingAccountIds)}");
            }
        }

        private static void ValidateTransaction(CreateTransactionDTO transactionDto)
        {
            if (transactionDto.Splits.Count < 2)
            {
                throw new InvalidOperationException("A transaction must contain at least two splits.");
            }

            if (transactionDto.Splits.Any(split => split.AccountId == Guid.Empty))
            {
                throw new InvalidOperationException("Each split must reference a valid account.");
            }

            if (transactionDto.Splits.Any(split => split.Amount <= 0))
            {
                throw new InvalidOperationException("Split amounts must be greater than zero.");
            }

            var debitTotal = transactionDto.Splits
                .Where(split => split.Side == SplitSide.Debit)
                .Sum(split => split.Amount);
            var creditTotal = transactionDto.Splits
                .Where(split => split.Side == SplitSide.Credit)
                .Sum(split => split.Amount);
            if (debitTotal != creditTotal)
            {
                throw new InvalidOperationException("A transaction must be balanced. Total debits must equal total credits.");
            }
        }

        private static void ValidateTransaction(UpdateTransactionDTO transactionDto)
        {
            if (transactionDto.Splits.Count < 2)
            {
                throw new InvalidOperationException("A transaction must contain at least two splits.");
            }

            if (transactionDto.Splits.Any(split => split.Id == Guid.Empty))
            {
                throw new InvalidOperationException("Each split must reference a valid split id.");
            }

            if (transactionDto.Splits.Any(split => split.AccountId == Guid.Empty))
            {
                throw new InvalidOperationException("Each split must reference a valid account.");
            }

            if (transactionDto.Splits.Any(split => split.Amount <= 0))
            {
                throw new InvalidOperationException("Split amounts must be greater than zero.");
            }

            var debitTotal = transactionDto.Splits
                .Where(split => split.Side == SplitSide.Debit)
                .Sum(split => split.Amount);
            var creditTotal = transactionDto.Splits
                .Where(split => split.Side == SplitSide.Credit)
                .Sum(split => split.Amount);
            if (debitTotal != creditTotal)
            {
                throw new InvalidOperationException("A transaction must be balanced. Total debits must equal total credits.");
            }
        }

        private static TransactionDTO MapTransaction(Transaction transaction)
        {
            return new TransactionDTO
            {
                Id = transaction.Id,
                TransactionDate = transaction.TransactionDate,
                Description = transaction.Description,
                ReferenceNumber = transaction.ReferenceNumber,
                CreatedAt = transaction.CreatedAt,
                Splits = transaction.Splits
                    .Select(split => new SplitDTO
                    {
                        Id = split.Id,
                        AccountId = split.AccountId,
                        Amount = split.Amount,
                        Side = split.Side,
                        Memo = split.Memo
                    })
                    .ToList()
            };
        }
    }
}
