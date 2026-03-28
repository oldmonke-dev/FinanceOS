namespace Finance.BusinessLayer.DTOs.UserPreferences
{
    public class UpdateUserPreferenceDTO
    {
        public string NumberGroupingStyle { get; set; } = "international";

        public string FinancialYearMode { get; set; } = "indian";

        public DateTime? CustomFinancialYearStartDate { get; set; }
    }
}
