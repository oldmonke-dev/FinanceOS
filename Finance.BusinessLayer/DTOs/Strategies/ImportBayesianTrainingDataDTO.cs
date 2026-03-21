namespace Finance.BusinessLayer.DTOs.Strategies
{
    public class ImportBayesianTrainingDataDTO
    {
        public List<BayesianTrainingExampleDTO> Examples { get; set; } = new();
    }
}
