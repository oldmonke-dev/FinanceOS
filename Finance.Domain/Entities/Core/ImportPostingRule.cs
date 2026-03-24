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

            return new List<Split>
            {
                new()
                {
                    Id = Guid.NewGuid(),
                    AccountId = sourceAccountId,
                    Amount = sourceAmount,
                    Memo = memo,
                },
                new()
                {
                    Id = Guid.NewGuid(),
                    AccountId = destinationAccountId,
                    Amount = -sourceAmount,
                    Memo = memo,
                },
            };
        }
    }
}
