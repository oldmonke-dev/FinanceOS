namespace Finance.BusinessLayer.DTOs.Strategies
{
    public class BayesianStatisticsExportDTO
    {
        public string Format { get; set; } = "finance.bayesian_statistics";

        public int Version { get; set; } = 1;

        public DateTime ExportedAt { get; set; } = DateTime.UtcNow;

        public List<BayesianStatisticsExportEntryDTO> Entries { get; set; } = new();
    }
}
