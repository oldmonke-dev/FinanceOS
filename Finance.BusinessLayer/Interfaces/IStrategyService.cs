using Finance.BusinessLayer.DTOs.Strategies;

namespace Finance.BusinessLayer.Interfaces
{
    public interface IStrategyService
    {
        Task<BayesianStrategyDTO> GetBayesianStrategyAsync(
            Guid userId,
            CancellationToken cancellationToken = default);

        Task<ImportBayesianTrainingResultDTO> ImportBayesianTrainingDataAsync(
            Guid userId,
            ImportBayesianTrainingDataDTO request,
            CancellationToken cancellationToken = default);

        Task DeleteBayesianLearningForAccountAsync(
            Guid userId,
            Guid destinationAccountId,
            CancellationToken cancellationToken = default);
    }
}
