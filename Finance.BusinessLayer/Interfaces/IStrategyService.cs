using Finance.BusinessLayer.DTOs.Strategies;

namespace Finance.BusinessLayer.Interfaces
{
    public interface IStrategyService
    {
        Task<BayesianStrategyDTO> GetBayesianStrategyAsync(
            Guid userId,
            bool isAdmin,
            CancellationToken cancellationToken = default);

        Task<ImportBayesianTrainingResultDTO> ImportBayesianTrainingDataAsync(
            Guid userId,
            bool isAdmin,
            ImportBayesianTrainingDataDTO request,
            CancellationToken cancellationToken = default);

        Task DeleteBayesianLearningForAccountAsync(
            Guid userId,
            bool isAdmin,
            Guid destinationAccountId,
            CancellationToken cancellationToken = default);
    }
}
