using Finance.BusinessLayer.DTOs;
using Finance.BusinessLayer.Interfaces;
using Finance.Domain.Entities.Core;
using Finance.Infrastructure.Repositories;
using Finance.WebAPI.Extensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Finance.WebAPI.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class AccountsController : ControllerBase
    {
        private readonly AccountRepository _accountRepository;
        private readonly IAccountWorkflowService _accountWorkflowService;

        public AccountsController(
            AccountRepository accountRepository,
            IAccountWorkflowService accountWorkflowService)
        {
            _accountRepository = accountRepository;
            _accountWorkflowService = accountWorkflowService;
        }

        [HttpGet]
        public async Task<ActionResult<List<AccountListItemDTO>>> GetAccounts()
        {
            var accounts = await _accountRepository.GetAllAccountsAsync(
                User.GetRequiredUserId(),
                User.IsAdmin());
            return Ok(accounts.Select(MapAccount));
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
                    MapAccount(createdAccount));
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
                return Ok(MapAccount(updatedAccount));
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
                return Ok(MapAccount(updatedAccount));
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

        private static AccountListItemDTO MapAccount(Account account)
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
                OwnerUserId = account.OwnerUserId,
                OwnerDisplayName = account.OwnerUser?.DisplayName,
                OwnerEmail = account.OwnerUser?.Email,
            };
        }
    }
}
