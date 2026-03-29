using Finance.Domain.Enums;

namespace Finance.Domain.Entities.Core
{
    public static class ImportPostingRule
    {
        public static List<Split> CreateBalancedSplits(
            Guid sourceAccountId,
            Guid destinationAccountId,
            decimal sourceAmount,
            string? memo)
        {
            if (sourceAmount == 0)
            {
                throw new InvalidOperationException("Import posting amount cannot be zero.");
            }

            var absoluteAmount = Math.Abs(sourceAmount);
            // Import amounts are normalized from the source account's perspective:
            // negative means money left the source account, positive means money entered it.
            var sourceSide = sourceAmount < 0 ? SplitSide.Credit : SplitSide.Debit;
            var destinationSide = sourceSide == SplitSide.Debit ? SplitSide.Credit : SplitSide.Debit;

            return new List<Split>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    AccountId = sourceAccountId,
                    Amount = absoluteAmount,
                    Side = sourceSide,
                    Memo = memo,
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    AccountId = destinationAccountId,
                    Amount = absoluteAmount,
                    Side = destinationSide,
                    Memo = memo,
                },
            };
        }
    }
}
