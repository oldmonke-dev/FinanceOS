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

        public static bool IsAdmin(this ClaimsPrincipal user)
        {
            return string.Equals(
                user.FindFirstValue("is_admin"),
                "true",
                StringComparison.OrdinalIgnoreCase);
        }

        public static bool IsSuperUser(this ClaimsPrincipal user)
        {
            return string.Equals(
                user.FindFirstValue("is_super_user"),
                "true",
                StringComparison.OrdinalIgnoreCase);
        }
    }
}
