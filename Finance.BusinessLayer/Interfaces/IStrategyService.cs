using Finance.BusinessLayer.DTOs.Strategies;

namespace Finance.BusinessLayer.Interfaces
{
    public interface IStrategyService
    {
        Task<BayesianStrategyDTO> GetBayesianStrategyAsync(CancellationToken cancellationToken = default);

        Task<ImportBayesianTrainingResultDTO> ImportBayesianTrainingDataAsync(
            ImportBayesianTrainingDataDTO request,
            CancellationToken cancellationToken = default);
    }
}
