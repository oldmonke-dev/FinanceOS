using Finance.BusinessLayer.DTOs;
using Finance.BusinessLayer.Interfaces;
using Finance.Domain.Entities.Core;
using Finance.Infrastructure.Data;
using Finance.Infrastructure.Repositories;
using Finance.WebAPI.Extensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace Finance.WebAPI.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class AccountsController : ControllerBase
    {
        private readonly AccountRepository _accountRepository;
        private readonly IAccountWorkflowService _accountWorkflowService;
        private readonly IAccountAccessService _accountAccessService;
        private readonly AppDbContext _context;

        public AccountsController(
            AccountRepository accountRepository,
            IAccountWorkflowService accountWorkflowService,
            IAccountAccessService accountAccessService,
            AppDbContext context)
        {
            _accountRepository = accountRepository;
            _accountWorkflowService = accountWorkflowService;
            _accountAccessService = accountAccessService;
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<List<AccountListItemDTO>>> GetAccounts()
        {
            var accounts = await _accountRepository.GetAllAccountsAsync(
                User.GetRequiredUserId(),
                User.IsAdmin());
            var permissionsByAccountId = await _accountAccessService.GetCurrentUserPermissionsAsync(
                accounts.Select(account => account.Id),
                User.GetRequiredUserId(),
                User.IsAdmin());

            return Ok(accounts.Select(account =>
                MapAccount(
                    account,
                    permissionsByAccountId.GetValueOrDefault(account.Id) ?? new AccountPermissionSummaryDTO())));
        }


        [HttpPost]
        public async Task<ActionResult<AccountListItemDTO>> CreateAccount([FromBody] AccountDTO account)
        {
            try
            {
                var createdAccount = await _accountRepository.CreateNewAccountAsync(
                    account,
                    User.GetRequiredUserId(),
                    User.IsAdmin());

                return CreatedAtAction(
                    nameof(GetAccounts),
                    new { id = createdAccount.Id },
                    MapAccount(
                        createdAccount,
                        (await _accountAccessService.GetCurrentUserPermissionsAsync(
                            new[] { createdAccount.Id },
                            User.GetRequiredUserId(),
                            User.IsAdmin()))
                        .GetValueOrDefault(createdAccount.Id) ?? new AccountPermissionSummaryDTO()));
            }
            catch (InvalidOperationException exception)
            {
                return BadRequest(new { message = exception.Message });
            }
        }

        [HttpDelete("{id:guid}")]
        public async Task<ActionResult<AccountDeletionResultDTO>> DeleteAccount(
            Guid id,
            CancellationToken cancellationToken)
        {
            try
            {
                var result = await _accountWorkflowService.DeleteAccountAsync(
                    id,
                    User.GetRequiredUserId(),
                    User.IsAdmin(),
                    cancellationToken);
                return Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return BadRequest(new { message = exception.Message });
            }
            catch (KeyNotFoundException exception)
            {
                return NotFound(new { message = exception.Message });
            }
        }

        [HttpPut("{id:guid}")]
        public async Task<ActionResult<AccountListItemDTO>> RenameAccount(Guid id, [FromBody] UpdateAccountNameDTO request)
        {
            try
            {
                var updatedAccount = await _accountRepository.RenameAccountAsync(
                    id,
                    request,
                    User.GetRequiredUserId(),
                    User.IsAdmin());
                return Ok(await MapAccountForCurrentUserAsync(updatedAccount));
            }
            catch (InvalidOperationException exception)
            {
                return BadRequest(new { message = exception.Message });
            }
            catch (KeyNotFoundException exception)
            {
                return NotFound(new { message = exception.Message });
            }
        }

        [HttpPut("{id:guid}/owner")]
        public async Task<ActionResult<AccountListItemDTO>> UpdateAccountOwner(
            Guid id,
            [FromBody] UpdateAccountOwnerDTO request)
        {
            try
            {
                var updatedAccount = await _accountRepository.UpdateAccountOwnerAsync(
                    id,
                    request.OwnerUserId,
                    User.GetRequiredUserId(),
                    User.IsAdmin());
                return Ok(await MapAccountForCurrentUserAsync(updatedAccount));
            }
            catch (InvalidOperationException exception)
            {
                return BadRequest(new { message = exception.Message });
            }
            catch (KeyNotFoundException exception)
            {
                return NotFound(new { message = exception.Message });
            }
        }

        [HttpGet("{id:guid}/permissions")]
        public async Task<ActionResult<AccountAccessDetailsDTO>> GetAccountPermissions(
            Guid id,
            CancellationToken cancellationToken)
        {
            try
            {
                await _accountAccessService.EnsureCanManageAccountAsync(
                    id,
                    User.GetRequiredUserId(),
                    User.IsAdmin(),
                    cancellationToken);
            }
            catch (InvalidOperationException exception)
            {
                return BadRequest(new { message = exception.Message });
            }

            var account = await _context.Accounts
                .Include(item => item.OwnerUser)
                .Include(item => item.AccessEntries)
                    .ThenInclude(item => item.User)
                .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);

            if (account is null)
            {
                return NotFound(new { message = "Account was not found." });
            }

            if (account.IsCore)
            {
                return BadRequest(new { message = "Core accounts use fixed global admin access." });
            }

            return Ok(await MapAccountAccessDetailsAsync(account, cancellationToken));
        }

        [HttpPut("{id:guid}/permissions")]
        public async Task<ActionResult<AccountAccessDetailsDTO>> UpdateAccountPermissions(
            Guid id,
            [FromBody] UpdateAccountPermissionsDTO request,
            CancellationToken cancellationToken)
        {
            try
            {
                await _accountAccessService.EnsureCanManageAccountAsync(
                    id,
                    User.GetRequiredUserId(),
                    User.IsAdmin(),
                    cancellationToken);
            }
            catch (InvalidOperationException exception)
            {
                return BadRequest(new { message = exception.Message });
            }

            var account = await _context.Accounts
                .Include(item => item.OwnerUser)
                .Include(item => item.AccessEntries)
                .FirstOrDefaultAsync(item => item.Id == id, cancellationToken);

            if (account is null)
            {
                return NotFound(new { message = "Account was not found." });
            }

            if (account.IsCore)
            {
                return BadRequest(new { message = "Core accounts use fixed global admin access." });
            }

            if (!User.IsAdmin() && request.OwnerUserId != account.OwnerUserId)
            {
                return BadRequest(new { message = "Only admins can change account ownership." });
            }

            var normalizedEntries = request.Entries
                .Where(entry => entry.UserId != Guid.Empty)
                .GroupBy(entry => entry.UserId)
                .Select(group =>
                {
                    var entry = group.Last();
                    var hasElevatedPermission =
                        entry.CanPost
                        || entry.CanEditTransaction
                        || entry.CanDeleteTransaction
                        || entry.CanManageAccess;

                    return new UpdateAccountAccessEntryDTO
                    {
                        UserId = entry.UserId,
                        CanView = entry.CanView || hasElevatedPermission,
                        CanPost = entry.CanPost,
                        CanEditTransaction = entry.CanEditTransaction,
                        CanDeleteTransaction = entry.CanDeleteTransaction,
                        CanManageAccess = entry.CanManageAccess,
                    };
                })
                .Where(entry =>
                    entry.CanView
                    || entry.CanPost
                    || entry.CanEditTransaction
                    || entry.CanDeleteTransaction
                    || entry.CanManageAccess)
                .ToList();

            var referencedUserIds = normalizedEntries
                .Select(entry => entry.UserId)
                .Append(request.OwnerUserId.GetValueOrDefault())
                .Where(userId => userId != Guid.Empty)
                .Distinct()
                .ToArray();

            var usersById = await _context.Users
                .Where(user => referencedUserIds.Contains(user.Id) && user.IsActive)
                .ToDictionaryAsync(user => user.Id, cancellationToken);

            if (request.OwnerUserId.HasValue && !usersById.ContainsKey(request.OwnerUserId.Value))
            {
                return BadRequest(new { message = "The selected owner was not found or is inactive." });
            }

            if (normalizedEntries.Any(entry => !usersById.ContainsKey(entry.UserId)))
            {
                return BadRequest(new { message = "One or more selected users were not found or are inactive." });
            }

            account.OwnerUserId = request.OwnerUserId;
            account.IsGloballyShared = request.OwnerUserId is null || request.IsGloballyShared;
            account.ReportingMode = request.ReportingMode;

            var existingAccessEntries = account.AccessEntries.ToList();
            if (existingAccessEntries.Count > 0)
            {
                _context.AccountAccesses.RemoveRange(existingAccessEntries);
            }

            foreach (var entry in normalizedEntries)
            {
                _context.AccountAccesses.Add(new AccountAccess
                {
                    Id = Guid.NewGuid(),
                    AccountId = account.Id,
                    UserId = entry.UserId,
                    CanView = entry.CanView,
                    CanPost = entry.CanPost,
                    CanEditTransaction = entry.CanEditTransaction,
                    CanDeleteTransaction = entry.CanDeleteTransaction,
                    CanManageAccess = entry.CanManageAccess,
                });
            }

            await _context.SaveChangesAsync(cancellationToken);

            var refreshedAccount = await _context.Accounts
                .Include(item => item.OwnerUser)
                .Include(item => item.AccessEntries)
                    .ThenInclude(item => item.User)
                .FirstAsync(item => item.Id == id, cancellationToken);

            return Ok(await MapAccountAccessDetailsAsync(refreshedAccount, cancellationToken));
        }

        private async Task<AccountListItemDTO> MapAccountForCurrentUserAsync(Account account)
        {
            var permissions = await _accountAccessService.GetCurrentUserPermissionsAsync(
                new[] { account.Id },
                User.GetRequiredUserId(),
                User.IsAdmin());

            return MapAccount(
                account,
                permissions.GetValueOrDefault(account.Id) ?? new AccountPermissionSummaryDTO());
        }

        private async Task<AccountAccessDetailsDTO> MapAccountAccessDetailsAsync(
            Account account,
            CancellationToken cancellationToken)
        {
            var permissions = await _accountAccessService.GetCurrentUserPermissionsAsync(
                new[] { account.Id },
                User.GetRequiredUserId(),
                User.IsAdmin(),
                cancellationToken);

            var availableUsers = await _context.Users
                .Where(user => user.IsActive)
                .OrderBy(user => user.DisplayName)
                .ThenBy(user => user.Email)
                .Select(user => new UserOptionDTO
                {
                    Id = user.Id,
                    DisplayName = user.DisplayName,
                    Email = user.Email,
                    IsAdmin = user.IsAdmin,
                })
                .ToListAsync(cancellationToken);

            return new AccountAccessDetailsDTO
            {
                AccountId = account.Id,
                AccountName = account.Name,
                OwnerUserId = account.OwnerUserId,
                OwnerDisplayName = account.OwnerUser?.DisplayName,
                OwnerEmail = account.OwnerUser?.Email,
                IsGloballyShared = account.IsGloballyShared,
                ReportingMode = account.ReportingMode,
                CurrentUserPermissions = permissions.GetValueOrDefault(account.Id) ?? new AccountPermissionSummaryDTO(),
                Entries = account.AccessEntries
                    .OrderBy(entry => entry.User?.DisplayName ?? entry.User?.Email ?? entry.UserId.ToString())
                    .Select(entry => new AccountAccessEntryDTO
                    {
                        UserId = entry.UserId,
                        UserDisplayName = entry.User?.DisplayName ?? entry.UserId.ToString(),
                        UserEmail = entry.User?.Email ?? string.Empty,
                        IsAdmin = entry.User?.IsAdmin ?? false,
                        CanView = entry.CanView,
                        CanPost = entry.CanPost,
                        CanEditTransaction = entry.CanEditTransaction,
                        CanDeleteTransaction = entry.CanDeleteTransaction,
                        CanManageAccess = entry.CanManageAccess,
                    })
                    .ToList(),
                AvailableUsers = availableUsers,
            };
        }

        private static AccountListItemDTO MapAccount(Account account, AccountPermissionSummaryDTO permissions)
        {
            return new AccountListItemDTO
            {
                Id = account.Id,
                Name = account.Name,
                AccountNumber = account.AccountNumber,
                Description = account.Description,
                AccountType = account.AccountType,
                ParentAccountId = account.ParentAccountId,
                OpeningBalance = account.OpeningBalance,
                IsCore = account.IsCore,
                IsGloballyShared = account.IsGloballyShared,
                OwnerUserId = account.OwnerUserId,
                OwnerDisplayName = account.OwnerUser?.DisplayName,
                OwnerEmail = account.OwnerUser?.Email,
                ReportingMode = account.ReportingMode,
                CurrentUserPermissions = permissions,
            };
        }
    }
}
