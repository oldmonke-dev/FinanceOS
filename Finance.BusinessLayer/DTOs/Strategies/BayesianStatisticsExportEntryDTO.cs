namespace Finance.BusinessLayer.DTOs.Strategies
{
    public class BayesianStatisticsExportEntryDTO
    {
        public string DestinationAccountPath { get; set; } = string.Empty;

        public Guid? DestinationAccountOwnerUserId { get; set; }

        public string FeatureKey { get; set; } = string.Empty;

        public int Count { get; set; }
    }
}
