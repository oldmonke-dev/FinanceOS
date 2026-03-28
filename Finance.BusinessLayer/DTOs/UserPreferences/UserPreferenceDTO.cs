namespace Finance.BusinessLayer.DTOs.UserPreferences
{
    public class UserPreferenceDTO
    {
        public Guid UserId { get; set; }

        public string NumberGroupingStyle { get; set; } = "international";

        public string FinancialYearMode { get; set; } = "indian";

        public DateTime? CustomFinancialYearStartDate { get; set; }

        public DateTime UpdatedAt { get; set; }
    }
}
