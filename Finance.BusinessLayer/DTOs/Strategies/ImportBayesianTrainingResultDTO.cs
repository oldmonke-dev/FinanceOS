namespace Finance.BusinessLayer.DTOs.Strategies
{
    public class ImportBayesianTrainingResultDTO
    {
        public int ImportedExampleCount { get; set; }

        public int SkippedExampleCount { get; set; }

        public List<string> MissingAccountPaths { get; set; } = new();
    }
}
