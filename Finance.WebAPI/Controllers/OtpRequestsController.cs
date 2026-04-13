using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Finance.BusinessLayer.DTOs.Otp;
using Finance.Domain.Entities.UserSession;
using Finance.Infrastructure.Data;
using Finance.WebAPI.Configuration;
using Finance.WebAPI.Extensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;

namespace Finance.WebAPI.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class OtpRequestsController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IDataProtector _otpProtector;
        private readonly OtpOptions _otpOptions;

        public OtpRequestsController(
            AppDbContext context,
            IDataProtectionProvider dataProtectionProvider,
            IOptions<OtpOptions> otpOptions)
        {
            _context = context;
            _otpProtector = dataProtectionProvider.CreateProtector("Finance.WebAPI.OtpPayload.v1");
            _otpOptions = otpOptions.Value;
        }

        [HttpGet]
        [Authorize]
        public async Task<ActionResult<List<OtpRequestDTO>>> GetRequests(CancellationToken cancellationToken)
        {
            var userId = User.GetRequiredUserId();
            var now = DateTime.UtcNow;

            var requests = await _context.OtpRequests
                .AsNoTracking()
                .Where(item => item.UserId == userId)
                .Include(item => item.Messages)
                .OrderByDescending(item => item.RequestedAt)
                .Take(Math.Clamp(_otpOptions.RequestHistoryLimit, 1, 100))
                .ToListAsync(cancellationToken);

            var targetUserIds = requests.Select(item => item.TargetUserId).Distinct().ToList();
            var targetUsers = await _context.Users
                .AsNoTracking()
                .Where(item => targetUserIds.Contains(item.Id))
                .ToDictionaryAsync(item => item.Id, cancellationToken);

            return Ok(requests.Select(item => MapRequest(item, now, targetUsers)).ToList());
        }

        [HttpPost]
        [Authorize]
        public async Task<ActionResult<OtpRequestDTO>> CreateRequest(
            [FromBody] CreateOtpRequestDTO request,
            CancellationToken cancellationToken)
        {
            var userId = User.GetRequiredUserId();
            var now = DateTime.UtcNow;

            if (request.TargetUserId == Guid.Empty)
            {
                return BadRequest(new { message = "A target user is required." });
            }

            if (request.TargetUserId == userId)
            {
                return BadRequest(new { message = "Choose another user as the OTP source." });
            }

            var targetUser = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(item => item.Id == request.TargetUserId && item.IsActive, cancellationToken);

            if (targetUser is null)
            {
                return NotFound(new { message = "Target user was not found." });
            }

            var activeRequests = await _context.OtpRequests
                .Where(item =>
                    item.UserId == userId
                    && item.TargetUserId == request.TargetUserId
                    && item.ClosedAt == null
                    && item.ExpiresAt > now)
                .ToListAsync(cancellationToken);

            foreach (var activeRequest in activeRequests)
            {
                activeRequest.ClosedAt = now;
            }

            var otpRequest = new OtpRequest
            {
                Id = Guid.NewGuid(),
                UserId = userId,
                TargetUserId = request.TargetUserId,
                RequestedAt = now,
                ExpiresAt = now.AddMinutes(Math.Max(_otpOptions.ActiveWindowMinutes, 1)),
            };

            _context.OtpRequests.Add(otpRequest);
            await _context.SaveChangesAsync(cancellationToken);

            return Ok(MapRequest(otpRequest, now, new Dictionary<Guid, Finance.Domain.Entities.Core.User>
            {
                [targetUser.Id] = targetUser,
            }));
        }

        [HttpPost("template")]
        [Authorize]
        public async Task<ActionResult<OtpTemplateDTO>> DownloadTemplate(
            [FromBody] OtpTemplateDownloadDTO? request,
            CancellationToken cancellationToken)
        {
            var userId = User.GetRequiredUserId();
            var user = await _context.Users
                .AsNoTracking()
                .FirstOrDefaultAsync(item => item.Id == userId && item.IsActive, cancellationToken);

            if (user is null)
            {
                return Unauthorized(new { message = "Authenticated user was not found." });
            }

            var now = DateTime.UtcNow;
            var registration = await _context.OtpDeviceRegistrations
                .FirstOrDefaultAsync(item => item.UserId == userId, cancellationToken);

            var deviceToken = CreateOpaqueToken();
            var tokenHash = ComputeTokenHash(deviceToken);

            if (registration is null)
            {
                registration = new OtpDeviceRegistration
                {
                    UserId = userId,
                    TokenHash = tokenHash,
                    CreatedAt = now,
                    UpdatedAt = now,
                };

                _context.OtpDeviceRegistrations.Add(registration);
            }
            else
            {
                registration.TokenHash = tokenHash;
                registration.UpdatedAt = now;
            }

            await _context.SaveChangesAsync(cancellationToken);

            var normalizedFrontendBaseUrl = NormalizeFrontendBaseUrl(_otpOptions.FrontendBaseUrl);
            if (normalizedFrontendBaseUrl is null)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new
                {
                    message = "Otp:FrontendBaseUrl must be configured with an absolute URL."
                });
            }

            var templatePayload = new
            {
                templateName = "Finance OTP Forwarder",
                version = 1,
                user = new
                {
                    id = user.Id,
                    email = user.Email,
                    displayName = user.DisplayName,
                },
                workflow = new
                {
                    trigger = "incoming_sms",
                    activeWindowMinutes = Math.Max(_otpOptions.ActiveWindowMinutes, 1),
                    destination = "finance-otp-ingestion",
                    ingestionUrl = $"{normalizedFrontendBaseUrl}/api-proxy/OtpRequests/ingest",
                    method = "POST",
                    authorizationHeader = $"Bearer {deviceToken}",
                    contentType = "application/json",
                    payload = new
                    {
                        sender = "{sender}",
                        message = "{message}",
                        receivedAt = "{receivedAtIsoUtc}",
                    },
                },
                tokenRotated = request?.RotateExistingToken ?? true,
            };

            return Ok(new OtpTemplateDTO
            {
                FileName = $"macrodroid-otp-{SanitizeFilePart(user.Email)}.json",
                ContentType = "application/json",
                TemplateJson = JsonSerializer.Serialize(templatePayload, new JsonSerializerOptions
                {
                    WriteIndented = true,
                }),
                IssuedAt = now,
            });
        }

        [HttpPost("ingest")]
        [AllowAnonymous]
        public async Task<ActionResult> Ingest(
            [FromBody] IngestOtpMessageDTO request,
            CancellationToken cancellationToken)
        {
            if (string.IsNullOrWhiteSpace(request.Sender))
            {
                return BadRequest(new { message = "Sender is required." });
            }

            if (string.IsNullOrWhiteSpace(request.Message))
            {
                return BadRequest(new { message = "Message is required." });
            }

            var deviceToken = ReadBearerToken(Request.Headers.Authorization.ToString());
            if (string.IsNullOrWhiteSpace(deviceToken))
            {
                return Unauthorized(new { message = "A device bearer token is required." });
            }

            var tokenHash = ComputeTokenHash(deviceToken);
            var registration = await _context.OtpDeviceRegistrations
                .AsNoTracking()
                .FirstOrDefaultAsync(item => item.TokenHash == tokenHash, cancellationToken);

            if (registration is null)
            {
                return Unauthorized(new { message = "The device token is invalid." });
            }

            var now = DateTime.UtcNow;
            var otpRequest = await _context.OtpRequests
                .OrderByDescending(item => item.RequestedAt)
                .FirstOrDefaultAsync(
                    item => item.TargetUserId == registration.UserId
                        && item.ClosedAt == null
                        && item.ExpiresAt > now,
                    cancellationToken);

            if (otpRequest is null)
            {
                return Conflict(new { message = "No active OTP request window is available for this device." });
            }

            var receivedAt = request.ReceivedAt?.ToUniversalTime() ?? now;
            var forwardedMessage = new OtpForwardedMessage
            {
                Id = Guid.NewGuid(),
                OtpRequestId = otpRequest.Id,
                UserId = otpRequest.UserId,
                SenderMasked = MaskSender(request.Sender),
                SenderEncrypted = _otpProtector.Protect(request.Sender.Trim()),
                MessagePreview = BuildMessagePreview(request.Message),
                MessageEncrypted = _otpProtector.Protect(request.Message.Trim()),
                ReceivedAt = receivedAt,
                CreatedAt = now,
            };

            otpRequest.LastForwardedAt = now;
            _context.OtpForwardedMessages.Add(forwardedMessage);
            await _context.SaveChangesAsync(cancellationToken);

            return Accepted(new { message = "OTP message accepted.", otpRequestId = otpRequest.Id });
        }

        private static OtpRequestDTO MapRequest(
            OtpRequest request,
            DateTime now,
            IReadOnlyDictionary<Guid, Finance.Domain.Entities.Core.User> targetUsers)
        {
            targetUsers.TryGetValue(request.TargetUserId, out var targetUser);

            return new OtpRequestDTO
            {
                Id = request.Id,
                TargetUserId = request.TargetUserId,
                TargetDisplayName = targetUser?.DisplayName ?? request.TargetUserId.ToString(),
                TargetEmail = targetUser?.Email ?? string.Empty,
                RequestedAt = request.RequestedAt,
                ExpiresAt = request.ExpiresAt,
                IsActive = request.ClosedAt == null && request.ExpiresAt > now,
                LastForwardedAt = request.LastForwardedAt,
                ForwardedMessageCount = request.Messages.Count,
                Messages = request.Messages
                    .OrderByDescending(item => item.ReceivedAt)
                    .Take(5)
                    .Select(item => new OtpForwardedMessageDTO
                    {
                        Id = item.Id,
                        SenderMasked = item.SenderMasked,
                        MessagePreview = item.MessagePreview,
                        ReceivedAt = item.ReceivedAt,
                    })
                    .ToList(),
            };
        }

        private static string CreateOpaqueToken()
        {
            return Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
                .TrimEnd('=')
                .Replace('+', '-')
                .Replace('/', '_');
        }

        private static string ComputeTokenHash(string rawToken)
        {
            var hashBytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken.Trim()));
            return Convert.ToHexString(hashBytes);
        }

        private static string? ReadBearerToken(string authorizationHeader)
        {
            const string bearerPrefix = "Bearer ";
            return authorizationHeader.StartsWith(bearerPrefix, StringComparison.OrdinalIgnoreCase)
                ? authorizationHeader[bearerPrefix.Length..].Trim()
                : null;
        }

        private static string BuildMessagePreview(string message)
        {
            var normalized = string.Join(
                " ",
                message.Trim().Split(['\r', '\n', '\t'], StringSplitOptions.RemoveEmptyEntries));

            if (normalized.Length == 0)
            {
                return "Message received";
            }

            var digitsMasked = new string(normalized.Select(character =>
                char.IsDigit(character) ? '*' : character).ToArray());

            return digitsMasked.Length <= 180
                ? digitsMasked
                : $"{digitsMasked[..177]}...";
        }

        private static string MaskSender(string sender)
        {
            var trimmed = sender.Trim();
            if (trimmed.Length <= 4)
            {
                return trimmed;
            }

            return $"{trimmed[..2]}***{trimmed[^2..]}";
        }

        private static string SanitizeFilePart(string value)
        {
            return new string(value
                .Trim()
                .ToLowerInvariant()
                .Select(character => char.IsLetterOrDigit(character) ? character : '-')
                .ToArray())
                .Trim('-');
        }

        private static string? NormalizeFrontendBaseUrl(string value)
        {
            if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri))
            {
                return null;
            }

            return uri.ToString().TrimEnd('/');
        }
    }
}
