namespace Finance.BusinessLayer.DTOs.Strategies
{
    public class BayesianMapGroupDTO
    {
        public Guid DestinationAccountId { get; set; }

        public string DestinationAccountName { get; set; } = string.Empty;

        public string DestinationAccountPath { get; set; } = string.Empty;

        public int TotalLearnedCount { get; set; }

        public List<BayesianMapEntryDTO> Entries { get; set; } = new();
    }
}
