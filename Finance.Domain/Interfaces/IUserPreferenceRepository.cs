using Finance.Domain.Entities.Core;

namespace Finance.Domain.Interfaces
{
    public interface IUserPreferenceRepository
    {
        Task<UserPreference> GetOrCreateAsync(Guid userId, CancellationToken cancellationToken = default);

        Task<UserPreference> UpdateNumberGroupingStyleAsync(
            Guid userId,
            string numberGroupingStyle,
            CancellationToken cancellationToken = default);
    }
}
