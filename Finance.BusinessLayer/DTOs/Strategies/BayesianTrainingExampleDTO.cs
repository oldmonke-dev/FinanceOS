namespace Finance.BusinessLayer.DTOs.Strategies
{
    public class BayesianTrainingExampleDTO
    {
        public string SourceAccountPath { get; set; } = string.Empty;

        public string DestinationAccountPath { get; set; } = string.Empty;

        public string? Description { get; set; }

        public string? Reference { get; set; }

        public string? Memo { get; set; }

        public decimal? Amount { get; set; }
    }
}
