namespace Finance.BusinessLayer.DTOs.Strategies
{
    public class BayesianStrategyDTO
    {
        public string StrategyKey { get; set; } = "bayesian_statistics";

        public int LearnedFeatureCount { get; set; }

        public int LearnedAccountCount { get; set; }

        public List<BayesianMapGroupDTO> MapGroups { get; set; } = new();
    }
}
