using System.Security.Claims;

namespace Finance.WebAPI.Extensions
{
    public static class ClaimsPrincipalExtensions
    {
        public static Guid GetRequiredUserId(this ClaimsPrincipal user)
        {
            var rawUserId = user.FindFirstValue(ClaimTypes.NameIdentifier)
                ?? user.FindFirstValue("sub");

            if (!Guid.TryParse(rawUserId, out var userId) || userId == Guid.Empty)
            {
                throw new InvalidOperationException("Authenticated user id claim is missing.");
            }

            return userId;
        }
    }
}
