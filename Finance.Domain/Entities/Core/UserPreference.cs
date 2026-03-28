namespace Finance.Domain.Entities.Core
{
    public class UserPreference
    {
        public Guid UserId { get; set; }

        public string NumberGroupingStyle { get; set; } = "international";

        public string FinancialYearMode { get; set; } = "indian";

        public DateTime? CustomFinancialYearStartDate { get; set; }

        public DateTime UpdatedAt { get; set; }

        public User User { get; set; } = null!;
    }
}
