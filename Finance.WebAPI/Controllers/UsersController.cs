using System.Net.Mail;
using Finance.BusinessLayer.DTOs.Users;
using Finance.Domain.Entities.Core;
using Finance.Infrastructure.Data;
using Finance.WebAPI.Extensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Finance.WebAPI.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class UsersController : ControllerBase
    {
        private readonly AppDbContext _context;

        public UsersController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<List<UserDTO>>> GetUsers(CancellationToken cancellationToken)
        {
            if (!User.IsAdmin())
            {
                return Forbid();
            }

            var users = await _context.Users
                .OrderBy(item => item.Email)
                .Select(item => MapUser(item))
                .ToListAsync(cancellationToken);

            return Ok(users);
        }

        [HttpPost]
        public async Task<ActionResult<UserDTO>> CreateUser(
            [FromBody] CreateUserDTO request,
            CancellationToken cancellationToken)
        {
            if (!User.IsAdmin())
            {
                return Forbid();
            }

            var normalizedEmail = NormalizeEmail(request.Email);
            if (normalizedEmail is null)
            {
                return BadRequest(new { message = "A valid email address is required." });
            }

            var displayName = request.DisplayName?.Trim() ?? string.Empty;
            if (displayName.Length == 0)
            {
                return BadRequest(new { message = "Display name is required." });
            }

            if (displayName.Length > 200)
            {
                return BadRequest(new { message = "Display name must be 200 characters or fewer." });
            }

            if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Trim().Length < 8)
            {
                return BadRequest(new { message = "Password must be at least 8 characters." });
            }

            var existingUser = await _context.Users
                .AnyAsync(
                    item => item.Email.ToLower() == normalizedEmail.ToLower(),
                    cancellationToken);

            if (existingUser)
            {
                return Conflict(new { message = "A user with that email already exists." });
            }

            var user = new User
            {
                Id = Guid.NewGuid(),
                Email = normalizedEmail,
                DisplayName = displayName,
                PasswordHash = string.Empty,
                IsAdmin = request.IsAdmin,
                IsActive = true,
                CreatedAt = DateTime.UtcNow,
            };

            var passwordHasher = new PasswordHasher<User>();
            user.PasswordHash = passwordHasher.HashPassword(user, request.Password);

            _context.Users.Add(user);
            _context.UserPreferences.Add(new UserPreference
            {
                UserId = user.Id,
                NumberGroupingStyle = "international",
                UpdatedAt = DateTime.UtcNow,
            });

            await _context.SaveChangesAsync(cancellationToken);

            return Ok(MapUser(user));
        }

        [HttpPut("{id:guid}/admin")]
        public async Task<ActionResult<UserDTO>> UpdateUserAdmin(
            Guid id,
            [FromBody] UpdateUserAdminDTO request,
            CancellationToken cancellationToken)
        {
            if (!User.IsAdmin())
            {
                return Forbid();
            }

            var targetUser = await _context.Users
                .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);

            if (targetUser is null)
            {
                return NotFound(new { message = "User was not found." });
            }

            if (targetUser.IsSuperUser)
            {
                return BadRequest(new { message = "Bootstrap super users cannot be demoted." });
            }

            if (!request.IsAdmin && targetUser.IsAdmin)
            {
                var adminCount = await _context.Users
                    .CountAsync(item => item.IsActive && item.IsAdmin, cancellationToken);

                if (adminCount <= 1)
                {
                    return BadRequest(new { message = "At least one active admin user must remain." });
                }
            }

            targetUser.IsAdmin = request.IsAdmin;
            await _context.SaveChangesAsync(cancellationToken);

            return Ok(MapUser(targetUser));
        }

        [HttpDelete("{id:guid}")]
        public async Task<ActionResult> DeleteUser(Guid id, CancellationToken cancellationToken)
        {
            if (!User.IsAdmin())
            {
                return Forbid();
            }

            if (User.GetRequiredUserId() == id)
            {
                return BadRequest(new { message = "You cannot delete your own user account." });
            }

            var targetUser = await _context.Users
                .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);

            if (targetUser is null)
            {
                return NotFound(new { message = "User was not found." });
            }

            if (targetUser.IsSuperUser)
            {
                return BadRequest(new { message = "Bootstrap super users cannot be deleted." });
            }

            if (targetUser.IsAdmin)
            {
                var adminCount = await _context.Users
                    .CountAsync(item => item.IsActive && item.IsAdmin, cancellationToken);

                if (adminCount <= 1)
                {
                    return BadRequest(new { message = "At least one active admin user must remain." });
                }
            }

            var preference = await _context.UserPreferences
                .FirstOrDefaultAsync(item => item.UserId == id, cancellationToken);

            if (preference is not null)
            {
                _context.UserPreferences.Remove(preference);
            }

            _context.Users.Remove(targetUser);
            await _context.SaveChangesAsync(cancellationToken);

            return NoContent();
        }

        private static string? NormalizeEmail(string? value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }

            var trimmedValue = value.Trim();

            try
            {
                var mailAddress = new MailAddress(trimmedValue);
                return mailAddress.Address.Trim().ToLowerInvariant();
            }
            catch
            {
                return null;
            }
        }

        private static UserDTO MapUser(User user)
        {
            return new UserDTO
            {
                Id = user.Id,
                Email = user.Email,
                DisplayName = user.DisplayName,
                IsAdmin = user.IsAdmin,
                IsSuperUser = user.IsSuperUser,
                IsActive = user.IsActive,
                CreatedAt = user.CreatedAt,
            };
        }
    }
}
