namespace Finance.BusinessLayer.DTOs.Strategies
{
    public class BayesianMapEntryDTO
    {
        public string FeatureKey { get; set; } = string.Empty;

        public int Count { get; set; }
    }
}
