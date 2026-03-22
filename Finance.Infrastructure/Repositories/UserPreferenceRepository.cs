using Finance.Domain.Entities.Core;
using Finance.Domain.Interfaces;
using Finance.Infrastructure.Data;
using Microsoft.EntityFrameworkCore;

namespace Finance.Infrastructure.Repositories
{
    public class UserPreferenceRepository : IUserPreferenceRepository
    {
        private readonly AppDbContext _context;

        public UserPreferenceRepository(AppDbContext context)
        {
            _context = context;
        }

        public async Task<UserPreference> GetOrCreateAsync(Guid userId, CancellationToken cancellationToken = default)
        {
            var preference = await _context.UserPreferences
                .FirstOrDefaultAsync(item => item.UserId == userId, cancellationToken);

            if (preference is not null)
            {
                return preference;
            }

            preference = new UserPreference
            {
                UserId = userId,
                NumberGroupingStyle = "international",
                UpdatedAt = DateTime.UtcNow,
            };

            _context.UserPreferences.Add(preference);
            await _context.SaveChangesAsync(cancellationToken);

            return preference;
        }

        public async Task<UserPreference> UpdateNumberGroupingStyleAsync(
            Guid userId,
            string numberGroupingStyle,
            CancellationToken cancellationToken = default)
        {
            var preference = await GetOrCreateAsync(userId, cancellationToken);
            preference.NumberGroupingStyle = numberGroupingStyle;
            preference.UpdatedAt = DateTime.UtcNow;

            await _context.SaveChangesAsync(cancellationToken);
            return preference;
        }
    }
}
