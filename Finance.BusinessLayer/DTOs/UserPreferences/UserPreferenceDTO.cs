namespace Finance.BusinessLayer.DTOs.UserPreferences
{
    public class UserPreferenceDTO
    {
        public Guid UserId { get; set; }

        public string NumberGroupingStyle { get; set; } = "international";

        public DateTime UpdatedAt { get; set; }
    }
}
