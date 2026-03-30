namespace Finance.BusinessLayer.DTOs.Strategies
{
    public class ImportBayesianStatisticsResultDTO
    {
        public int ImportedEntryCount { get; set; }

        public int SkippedEntryCount { get; set; }

        public List<string> MissingAccountPaths { get; set; } = new();
    }
}
