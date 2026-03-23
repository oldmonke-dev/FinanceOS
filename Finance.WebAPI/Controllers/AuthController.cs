using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using Finance.BusinessLayer.DTOs.Auth;
using Finance.Infrastructure.Data;
using Finance.WebAPI.Configuration;
using Finance.WebAPI.Extensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;

namespace Finance.WebAPI.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly AuthOptions _authOptions;

        public AuthController(AppDbContext context, IOptions<AuthOptions> authOptions)
        {
            _context = context;
            _authOptions = authOptions.Value;
        }

        [HttpPost("login")]
        [AllowAnonymous]
        public async Task<ActionResult<LoginResponseDTO>> Login(
            [FromBody] LoginRequestDTO request,
            CancellationToken cancellationToken)
        {
            var normalizedEmail = request.Email.Trim().ToLowerInvariant();
            var bootstrapUser = _authOptions.BootstrapUsers.FirstOrDefault(item =>
                string.Equals(item.Email.Trim(), normalizedEmail, StringComparison.OrdinalIgnoreCase)
                && item.Password == request.Password);

            if (bootstrapUser is null)
            {
                return Unauthorized(new { message = "Invalid email or password." });
            }

            var user = await _context.Users
                .FirstOrDefaultAsync(item =>
                    item.IsActive
                    && item.Email.ToLower() == normalizedEmail,
                    cancellationToken);

            if (user is null)
            {
                return Unauthorized(new { message = "No active user matches those credentials." });
            }

            user.LastSeenAt = DateTime.UtcNow;
            await _context.SaveChangesAsync(cancellationToken);

            return Ok(BuildLoginResponse(user));
        }

        [HttpGet("me")]
        [Authorize]
        public async Task<ActionResult<AuthenticatedUserDTO>> Me(CancellationToken cancellationToken)
        {
            var userId = User.GetRequiredUserId();
            var user = await _context.Users
                .Where(item => item.IsActive && item.Id == userId)
                .Select(item => new AuthenticatedUserDTO
                {
                    Id = item.Id,
                    Email = item.Email,
                    DisplayName = item.DisplayName,
                })
                .FirstOrDefaultAsync(cancellationToken);

            if (user is null)
            {
                return Unauthorized(new { message = "Authenticated user was not found." });
            }

            return Ok(user);
        }

        private LoginResponseDTO BuildLoginResponse(Finance.Domain.Entities.Core.User user)
        {
            var now = DateTime.UtcNow;
            var expiresAt = now.AddMinutes(_authOptions.TokenLifetimeMinutes);
            var claims = new List<Claim>
            {
                new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
                new(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new(ClaimTypes.Email, user.Email),
                new(ClaimTypes.Name, user.DisplayName),
            };

            var credentials = new SigningCredentials(
                new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_authOptions.JwtSecret)),
                SecurityAlgorithms.HmacSha256);

            var token = new JwtSecurityToken(
                issuer: _authOptions.Issuer,
                audience: _authOptions.Audience,
                claims: claims,
                notBefore: now,
                expires: expiresAt,
                signingCredentials: credentials);

            return new LoginResponseDTO
            {
                AccessToken = new JwtSecurityTokenHandler().WriteToken(token),
                ExpiresAt = expiresAt,
                User = new AuthenticatedUserDTO
                {
                    Id = user.Id,
                    Email = user.Email,
                    DisplayName = user.DisplayName,
                },
            };
        }
    }
}
