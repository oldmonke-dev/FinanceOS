using Finance.BusinessLayer.DTOs.UserPreferences;
using Finance.Domain.Entities.Core;
using Finance.Domain.Interfaces;
using Finance.WebAPI.Extensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Finance.WebAPI.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class UserPreferencesController : ControllerBase
    {
        private static readonly HashSet<string> AllowedNumberGroupingStyles = new(StringComparer.OrdinalIgnoreCase)
        {
            "international",
            "indian",
        };

        private static readonly HashSet<string> AllowedFinancialYearModes = new(StringComparer.OrdinalIgnoreCase)
        {
            "indian",
            "american",
            "custom",
        };

        private readonly IUserPreferenceRepository _userPreferenceRepository;

        public UserPreferencesController(IUserPreferenceRepository userPreferenceRepository)
        {
            _userPreferenceRepository = userPreferenceRepository;
        }

        [HttpGet]
        public async Task<ActionResult<UserPreferenceDTO>> Get(CancellationToken cancellationToken)
        {
            var preference = await _userPreferenceRepository.GetOrCreateAsync(
                User.GetRequiredUserId(),
                cancellationToken);
            return Ok(MapPreference(preference));
        }

        [HttpPut]
        public async Task<ActionResult<UserPreferenceDTO>> Update(
            [FromBody] UpdateUserPreferenceDTO request,
            CancellationToken cancellationToken)
        {
            var normalizedStyle = NormalizeNumberGroupingStyle(request.NumberGroupingStyle);
            if (!AllowedNumberGroupingStyles.Contains(normalizedStyle))
            {
                return BadRequest(new { message = "Number grouping style is not supported." });
            }

            var normalizedFinancialYearMode = NormalizeFinancialYearMode(request.FinancialYearMode);
            if (!AllowedFinancialYearModes.Contains(normalizedFinancialYearMode))
            {
                return BadRequest(new { message = "Financial year mode is not supported." });
            }

            if (normalizedFinancialYearMode == "custom" && !request.CustomFinancialYearStartDate.HasValue)
            {
                return BadRequest(new { message = "Custom financial year start date is required." });
            }

            var preference = await _userPreferenceRepository.UpdatePreferencesAsync(
                User.GetRequiredUserId(),
                normalizedStyle,
                normalizedFinancialYearMode,
                normalizedFinancialYearMode == "custom" ? request.CustomFinancialYearStartDate : null,
                cancellationToken);

            return Ok(MapPreference(preference));
        }

        private static string NormalizeNumberGroupingStyle(string? value)
        {
            return string.IsNullOrWhiteSpace(value) ? "international" : value.Trim().ToLowerInvariant();
        }

        private static string NormalizeFinancialYearMode(string? value)
        {
            return string.IsNullOrWhiteSpace(value) ? "indian" : value.Trim().ToLowerInvariant();
        }

        private static UserPreferenceDTO MapPreference(UserPreference preference)
        {
            return new UserPreferenceDTO
            {
                UserId = preference.UserId,
                NumberGroupingStyle = preference.NumberGroupingStyle,
                FinancialYearMode = preference.FinancialYearMode,
                CustomFinancialYearStartDate = preference.CustomFinancialYearStartDate,
                UpdatedAt = preference.UpdatedAt,
            };
        }
    }
}
