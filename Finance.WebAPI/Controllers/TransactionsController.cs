using Finance.BusinessLayer.DTOs.Transactions;
using Finance.BusinessLayer.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Finance.WebAPI.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class TransactionsController : ControllerBase
    {
        private readonly ITransactionService _transactionService;

        public TransactionsController(ITransactionService transactionService)
        {
            _transactionService = transactionService;
        }

        [HttpGet]
        public async Task<ActionResult<List<TransactionDTO>>> GetTransactions(
            [FromQuery] Guid? accountId,
            CancellationToken cancellationToken)
        {
            try
            {
                var transactions = await _transactionService.GetTransactionsAsync(accountId, cancellationToken);
                return Ok(transactions);
            }
            catch (InvalidOperationException exception)
            {
                return BadRequest(new { message = exception.Message });
            }
        }

        [HttpPut("{id:guid}")]
        public async Task<ActionResult<TransactionDTO>> UpdateTransaction(
            Guid id,
            [FromBody] UpdateTransactionDTO transaction,
            CancellationToken cancellationToken)
        {
            try
            {
                var updatedTransaction = await _transactionService.UpdateTransactionAsync(id, transaction, cancellationToken);
                return Ok(updatedTransaction);
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

        [HttpPost]
        public async Task<ActionResult<TransactionDTO>> CreateTransaction(
            [FromBody] CreateTransactionDTO transaction,
            CancellationToken cancellationToken)
        {
            try
            {
                var createdTransaction = await _transactionService.CreateTransactionAsync(transaction, cancellationToken);

                return CreatedAtAction(
                    nameof(CreateTransaction),
                    new { id = createdTransaction.Id },
                    createdTransaction);
            }
            catch (InvalidOperationException exception)
            {
                return BadRequest(new { message = exception.Message });
            }
        }

        [HttpDelete("{id:guid}")]
        public async Task<IActionResult> DeleteTransaction(
            Guid id,
            CancellationToken cancellationToken)
        {
            try
            {
                await _transactionService.DeleteTransactionAsync(id, cancellationToken);
                return NoContent();
            }
            catch (KeyNotFoundException exception)
            {
                return NotFound(new { message = exception.Message });
            }
        }
    }
}
