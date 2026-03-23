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
        public async Task<ActionResult<List<Account>>> GetAccounts()
        {
            var accounts = await _accountRepository.GetAllAccountsAsync();
            return Ok(accounts);
        }


        [HttpPost]
        public async Task<ActionResult<Account>> CreateAccount([FromBody] AccountDTO account)
        {
            try
            {
                var createdAccount = await _accountRepository.CreateNewAccountAsync(account);

                return CreatedAtAction(
                    nameof(GetAccounts),
                    new { id = createdAccount.Id },
                    createdAccount);
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
        public async Task<ActionResult<Account>> RenameAccount(Guid id, [FromBody] UpdateAccountNameDTO request)
        {
            try
            {
                var updatedAccount = await _accountRepository.RenameAccountAsync(id, request);
                return Ok(updatedAccount);
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
    }
}
