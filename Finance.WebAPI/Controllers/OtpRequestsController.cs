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

            var shouldRotateToken = request?.RotateExistingToken == true;
            var hasReusableToken = !string.IsNullOrWhiteSpace(registration?.ProtectedToken);
            string deviceToken;

            if (!shouldRotateToken && hasReusableToken)
            {
                try
                {
                    deviceToken = _otpProtector.Unprotect(registration!.ProtectedToken!);
                }
                catch (CryptographicException)
                {
                    // The app key ring changed, so the old stored device token can no longer be unprotected.
                    // Regenerate the token instead of failing the template download.
                    deviceToken = CreateOpaqueToken();
                }
            }
            else
            {
                deviceToken = CreateOpaqueToken();
            }

            var tokenHash = ComputeTokenHash(deviceToken);
            var protectedToken = _otpProtector.Protect(deviceToken);

            if (registration is null)
            {
                registration = new OtpDeviceRegistration
                {
                    UserId = userId,
                    TokenHash = tokenHash,
                    ProtectedToken = protectedToken,
                    CreatedAt = now,
                    UpdatedAt = now,
                };

                _context.OtpDeviceRegistrations.Add(registration);
            }
            else
            {
                registration.TokenHash = tokenHash;
                registration.ProtectedToken = protectedToken;
                registration.UpdatedAt = now;
            }

            await _context.SaveChangesAsync(cancellationToken);

            var ingestUrl = ResolveTemplateIngestUrl(_otpOptions);
            if (ingestUrl is null)
            {
                return StatusCode(StatusCodes.Status500InternalServerError, new
                {
                    message = "Configure either Otp:IngestBaseUrl or Otp:FrontendBaseUrl with an absolute URL."
                });
            }

            var templatePayload = BuildMacroDroidTemplatePayload(
                user.DisplayName,
                user.Email,
                ingestUrl,
                deviceToken);

            return Ok(new OtpTemplateDTO
            {
                FileName = $"macrodroid-otp-{SanitizeFilePart(user.Email)}.macro",
                ContentType = "application/octet-stream",
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
            CancellationToken cancellationToken)
        {
            var requestModel = await ReadIngestRequestAsync(cancellationToken);

            if (string.IsNullOrWhiteSpace(requestModel.Sender))
            {
                return BadRequest(new { message = "Sender is required." });
            }

            if (string.IsNullOrWhiteSpace(requestModel.Message))
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

            var receivedAt = requestModel.ReceivedAt?.ToUniversalTime() ?? now;
            var forwardedMessage = new OtpForwardedMessage
            {
                Id = Guid.NewGuid(),
                OtpRequestId = otpRequest.Id,
                UserId = otpRequest.UserId,
                SenderMasked = MaskSender(requestModel.Sender),
                SenderEncrypted = _otpProtector.Protect(requestModel.Sender.Trim()),
                MessagePreview = BuildMessagePreview(requestModel.Message),
                MessageEncrypted = _otpProtector.Protect(requestModel.Message.Trim()),
                ReceivedAt = receivedAt,
                CreatedAt = now,
            };

            otpRequest.LastForwardedAt = now;
            _context.OtpForwardedMessages.Add(forwardedMessage);
            await _context.SaveChangesAsync(cancellationToken);

            return Accepted(new { message = "OTP message accepted.", otpRequestId = otpRequest.Id });
        }

        [HttpDelete("messages")]
        [Authorize]
        public async Task<ActionResult> ClearForwardedMessages(CancellationToken cancellationToken)
        {
            var userId = User.GetRequiredUserId();

            var deletedMessageCount = await _context.OtpForwardedMessages
                .Where(item => item.UserId == userId)
                .ExecuteDeleteAsync(cancellationToken);

            var deletedRequestCount = await _context.OtpRequests
                .Where(item => item.UserId == userId)
                .ExecuteDeleteAsync(cancellationToken);

            return Ok(new
            {
                deletedMessageCount,
                deletedRequestCount,
            });
        }

        private async Task<IngestOtpMessageDTO> ReadIngestRequestAsync(CancellationToken cancellationToken)
        {
            var senderHeader = Request.Headers["X-Otp-Sender"].ToString();
            var receivedAtHeader = Request.Headers["X-Otp-ReceivedAt"].ToString();
            var contentType = Request.ContentType ?? string.Empty;

            Request.EnableBuffering();

            using var reader = new StreamReader(Request.Body, Encoding.UTF8, detectEncodingFromByteOrderMarks: false, leaveOpen: true);
            var rawBody = await reader.ReadToEndAsync(cancellationToken);
            Request.Body.Position = 0;

            if (contentType.StartsWith("text/plain", StringComparison.OrdinalIgnoreCase))
            {
                return new IngestOtpMessageDTO
                {
                    Sender = senderHeader,
                    Message = rawBody,
                    ReceivedAt = ParseOptionalUtc(receivedAtHeader),
                };
            }

            if (!string.IsNullOrWhiteSpace(rawBody))
            {
                try
                {
                    var parsed = JsonSerializer.Deserialize<IngestOtpMessageDTO>(
                        rawBody,
                        new JsonSerializerOptions
                        {
                            PropertyNameCaseInsensitive = true,
                        });

                    if (parsed is not null)
                    {
                        return parsed;
                    }
                }
                catch (JsonException)
                {
                    // Fall through to header/query fallback for malformed client payloads.
                }
            }

            return new IngestOtpMessageDTO
            {
                Sender = Request.Query["sender"].ToString(),
                Message = Request.Query["message"].ToString(),
                ReceivedAt = ParseOptionalUtc(Request.Query["receivedAt"].ToString()),
            };
        }

        private static DateTime? ParseOptionalUtc(string rawValue)
        {
            return DateTime.TryParse(rawValue, out var parsed)
                ? parsed.ToUniversalTime()
                : null;
        }

        private OtpRequestDTO MapRequest(
            OtpRequest request,
            DateTime now,
            IReadOnlyDictionary<Guid, Finance.Domain.Entities.Core.User> targetUsers)
        {
            targetUsers.TryGetValue(request.TargetUserId, out var targetUser);
            var isActive = request.ClosedAt == null && request.ExpiresAt > now;

            return new OtpRequestDTO
            {
                Id = request.Id,
                TargetUserId = request.TargetUserId,
                TargetDisplayName = targetUser?.DisplayName ?? request.TargetUserId.ToString(),
                TargetEmail = targetUser?.Email ?? string.Empty,
                RequestedAt = request.RequestedAt,
                ExpiresAt = request.ExpiresAt,
                IsActive = isActive,
                LastForwardedAt = request.LastForwardedAt,
                ForwardedMessageCount = request.Messages.Count,
                Messages = request.Messages
                    .OrderByDescending(item => item.ReceivedAt)
                    .Take(5)
                    .Select(item => new OtpForwardedMessageDTO
                    {
                        Id = item.Id,
                        SenderMasked = item.SenderMasked,
                        Sender = isActive ? TryUnprotect(item.SenderEncrypted) : null,
                        MessagePreview = item.MessagePreview,
                        Message = isActive ? TryUnprotect(item.MessageEncrypted) : null,
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

        private static string? NormalizeAbsoluteBaseUrl(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }

            if (!Uri.TryCreate(value.Trim(), UriKind.Absolute, out var uri))
            {
                return null;
            }

            return uri.ToString().TrimEnd('/');
        }

        private static string? ResolveTemplateIngestUrl(OtpOptions options)
        {
            var ingestBaseUrl = NormalizeAbsoluteBaseUrl(options.IngestBaseUrl);
            if (ingestBaseUrl is not null)
            {
                return $"{ingestBaseUrl}/OtpRequests/ingest";
            }

            var frontendBaseUrl = NormalizeAbsoluteBaseUrl(options.FrontendBaseUrl);
            return frontendBaseUrl is null
                ? null
                : $"{frontendBaseUrl}/api-proxy/OtpRequests/ingest";
        }

        private static object BuildMacroDroidTemplatePayload(
            string displayName,
            string email,
            string ingestUrl,
            string deviceToken)
        {
            var macroGuid = NextMacroDroidId();
            var actionGuid = NextMacroDroidId();
            var postNotificationGuid = NextMacroDroidId();
            var triggerGuid = NextMacroDroidId();

            return new
            {
                globalVariables = new object[]
                {
                    new
                    {
                        dictionary = new
                        {
                            entries = Array.Empty<object>(),
                            isArray = false,
                            variableType = 4,
                            type = "Dictionary",
                        },
                        isActionBlockWorkingVar = false,
                        isLocalVar = false,
                        isSecure = false,
                        m_booleanValue = false,
                        m_decimalValue = 0.0,
                        m_intValue = 0,
                        m_name = "otp_response",
                        m_stringValue = string.Empty,
                        m_type = 2,
                        supportsInput = true,
                        supportsOutput = true,
                    },
                    new
                    {
                        dictionary = new
                        {
                            entries = Array.Empty<object>(),
                            isArray = false,
                            variableType = 4,
                            type = "Dictionary",
                        },
                        isActionBlockWorkingVar = false,
                        isLocalVar = false,
                        isSecure = false,
                        m_booleanValue = false,
                        m_decimalValue = 0.0,
                        m_intValue = 0,
                        m_name = "otp_status_code",
                        m_stringValue = string.Empty,
                        m_type = 1,
                        supportsInput = true,
                        supportsOutput = true,
                    },
                },
                macro = new
                {
                    breakpoints = Array.Empty<object>(),
                    disabledTimestamp = 0,
                    exportedActionBlocks = Array.Empty<object>(),
                    forceEvenIfNotEnabledTimestamp = 0,
                    isActionBlock = false,
                    isExtra = false,
                    isFavourite = false,
                    lastEditedTimestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    localVariables = Array.Empty<object>(),
                    localVarsAlphabetical = true,
                    m_GUID = macroGuid,
                    m_actionList = new object[]
                    {
                        new
                        {
                            requestConfig = new
                            {
                                allFilesAccessPath = string.Empty,
                                allowAnyCertificate = false,
                                basicAuthEnabled = false,
                                basicAuthPassword = string.Empty,
                                basicAuthUsername = string.Empty,
                                blockNextAction = true,
                                clientCertEnabled = false,
                                clientCertKeyStoreDisplayName = string.Empty,
                                clientCertKeyStoreUri = string.Empty,
                                clientCertPassword = string.Empty,
                                contentBodyDynamicFileName = string.Empty,
                                contentBodyFileDisplayName = string.Empty,
                                contentBodyFileUri = string.Empty,
                                contentBodyFolderDisplayName = string.Empty,
                                contentBodyFolderUri = string.Empty,
                                contentBodySource = 0,
                                contentBodyText = "{sms_message}",
                                contentType = "text/plain; charset=utf-8",
                                followRedirects = true,
                                headerParams = new object[]
                                {
                                    new
                                    {
                                        paramName = "Authorization",
                                        paramValue = $"Bearer {deviceToken}",
                                    },
                                    new
                                    {
                                        paramName = "X-Otp-Sender",
                                        paramValue = "{sms_number}",
                                    },
                                },
                                localFileUri = string.Empty,
                                prettifyJson = false,
                                queryParams = Array.Empty<object>(),
                                requestTimeOutSeconds = 15,
                                requestType = 1,
                                responseVariableName = "otp_response",
                                returnCodeVariableName = "otp_status_code",
                                saveResponseAllFilesAccessPath = string.Empty,
                                saveResponseFileName = string.Empty,
                                saveResponseFolderPathDisplayName = string.Empty,
                                saveResponseFolderPathUri = string.Empty,
                                saveResponseType = 1,
                                saveResponseUseAllFilesAccess = false,
                                saveReturnCodeToVariable = true,
                                saveReturnHeadersToVariable = false,
                                urlToOpen = ingestUrl,
                                useAllFilesAccess = false,
                                useLocalFileUri = false,
                                useStaticContentBodyFile = true,
                            },
                            disableLogging = false,
                            m_SIGUID = actionGuid,
                            m_classType = "HttpRequestAction",
                            m_constraintList = Array.Empty<object>(),
                            m_isDisabled = false,
                            m_isOrCondition = false,
                        },
                        new
                        {
                            autoExpand = true,
                            blockNextAction = false,
                            dimBackground = true,
                            disableHtml = false,
                            displayOverStatusBar = false,
                            iconText = string.Empty,
                            iconType = 0,
                            liveNotification = false,
                            m_backgroundColor = -16777216,
                            m_iconBgColor = -769226,
                            m_imageResourceId = 0,
                            m_macroGUIDToRun = 0,
                            m_notificationChannelType = 0,
                            m_notificationSubject = "OTP forward result",
                            m_notificationText = "OTP sent successfully or failed. HTTP status {v=otp_status_code}.",
                            m_overwriteExisting = false,
                            m_priority = 0,
                            m_ringtoneIndex = 0,
                            m_ringtoneName = "Default",
                            m_runMacroWhenPressed = false,
                            m_textColor = -1,
                            maintainSpaces = false,
                            notificationActionButtons = Array.Empty<object>(),
                            notificationChannelName = "Notification action",
                            notificationIdString = "0",
                            notificatonId = 0,
                            preventAndroid16Grouping = true,
                            preventBackButtonClosing = false,
                            preventRemovalByBin = false,
                            showAsOverlayOption = 1,
                            yPosition = 0.5,
                            disableLogging = false,
                            m_SIGUID = postNotificationGuid,
                            m_classType = "NotificationAction",
                            m_constraintList = Array.Empty<object>(),
                            m_isDisabled = false,
                            m_isOrCondition = false,
                        },
                    },
                    m_category = "Finance OTP",
                    m_constraintList = Array.Empty<object>(),
                    m_description = $"Forward incoming SMS to Finance OTP ingestion endpoint for {email}.",
                    m_descriptionOpen = false,
                    m_enabled = true,
                    m_excludeLog = false,
                    m_headingColor = 0,
                    m_isOrCondition = false,
                    m_name = $"Finance OTP Forwarder - {displayName}",
                    m_triggerList = new object[]
                    {
                        new
                        {
                            enableRegex = false,
                            enableRegexPhoneNumber = false,
                            ignoreCase = true,
                            isExcludeContact = false,
                            m_exactMatch = false,
                            m_excludes = false,
                            m_groupIdList = Array.Empty<object>(),
                            m_groupNameList = Array.Empty<object>(),
                            m_option = 3,
                            m_smsContent = string.Empty,
                            m_smsFromList = Array.Empty<object>(),
                            m_smsNumberExclude = false,
                            subscriptionId = -1,
                            disableLogging = false,
                            m_SIGUID = triggerGuid,
                            m_classType = "IncomingSMSTrigger",
                            m_constraintList = Array.Empty<object>(),
                            m_isDisabled = false,
                            m_isOrCondition = false,
                        },
                    },
                },
                macroExportVersion = 1,
            };
        }

        private static long NextMacroDroidId()
        {
            return BitConverter.ToInt64(RandomNumberGenerator.GetBytes(sizeof(long)));
        }

        private string? TryUnprotect(string protectedValue)
        {
            try
            {
                return _otpProtector.Unprotect(protectedValue);
            }
            catch
            {
                return null;
            }
        }
    }
}
