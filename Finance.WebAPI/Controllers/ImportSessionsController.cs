using Finance.BusinessLayer.DTOs.ImportSessions;
using Finance.BusinessLayer.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Finance.WebAPI.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class ImportSessionsController : ControllerBase
    {
        private readonly IImportSessionService _importSessionService;

        public ImportSessionsController(IImportSessionService importSessionService)
        {
            _importSessionService = importSessionService;
        }

        [HttpPost]
        public async Task<ActionResult<ImportSessionDTO>> CreateImportSession(
            [FromBody] CreateImportSessionDTO session,
            CancellationToken cancellationToken)
        {
            try
            {
                var createdSession = await _importSessionService.CreateImportSessionAsync(session, cancellationToken);

                return CreatedAtAction(
                    nameof(GetImportSession),
                    new { id = createdSession.Id },
                    createdSession);
            }
            catch (InvalidOperationException exception)
            {
                return BadRequest(new { message = exception.Message });
            }
        }

        [HttpGet]
        public async Task<ActionResult<List<ImportSessionDTO>>> GetImportSessions(CancellationToken cancellationToken)
        {
            var sessions = await _importSessionService.GetImportSessionsAsync(cancellationToken);
            return Ok(sessions);
        }

        [HttpGet("{id:guid}")]
        public async Task<ActionResult<ImportSessionDTO>> GetImportSession(Guid id, CancellationToken cancellationToken)
        {
            try
            {
                var session = await _importSessionService.GetImportSessionAsync(id, cancellationToken);
                return Ok(session);
            }
            catch (KeyNotFoundException exception)
            {
                return NotFound(new { message = exception.Message });
            }
        }

        [HttpDelete("{id:guid}")]
        public async Task<IActionResult> DeleteImportSession(Guid id, CancellationToken cancellationToken)
        {
            try
            {
                await _importSessionService.DeleteImportSessionAsync(id, cancellationToken);
                return NoContent();
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

        [HttpPatch("{sessionId:guid}/source-account")]
        public async Task<ActionResult<ImportSessionDTO>> UpdateSourceAccount(
            Guid sessionId,
            [FromBody] UpdateImportSessionSourceAccountDTO request,
            CancellationToken cancellationToken)
        {
            try
            {
                var session = await _importSessionService.UpdateSourceAccountAsync(
                    sessionId,
                    request.SourceAccountId,
                    cancellationToken);

                return Ok(session);
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

        [HttpPatch("{sessionId:guid}/title")]
        public async Task<ActionResult<ImportSessionDTO>> UpdateTitle(
            Guid sessionId,
            [FromBody] UpdateImportSessionTitleDTO request,
            CancellationToken cancellationToken)
        {
            try
            {
                var session = await _importSessionService.UpdateTitleAsync(
                    sessionId,
                    request.FileName,
                    cancellationToken);

                return Ok(session);
            }
            catch (KeyNotFoundException exception)
            {
                return NotFound(new { message = exception.Message });
            }
        }

        [HttpPatch("{sessionId:guid}/rows/{rowId:guid}/destination-account")]
        public async Task<ActionResult<ImportSessionRowDTO>> UpdateRowDestinationAccount(
            Guid sessionId,
            Guid rowId,
            [FromBody] UpdateImportSessionRowDestinationAccountDTO request,
            CancellationToken cancellationToken)
        {
            try
            {
                var row = await _importSessionService.UpdateRowDestinationAccountAsync(
                    sessionId,
                    rowId,
                    request.DestinationAccountId,
                    cancellationToken);

                return Ok(row);
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

        [HttpPost("{sessionId:guid}/add-to-ledger")]
        public async Task<ActionResult<AddImportSessionToLedgerResultDTO>> AddSessionToLedger(
            Guid sessionId,
            CancellationToken cancellationToken)
        {
            try
            {
                var result = await _importSessionService.AddSessionToLedgerAsync(sessionId, cancellationToken);
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

        [HttpPost("{sessionId:guid}/learning/reapply")]
        public async Task<ActionResult<ImportSessionDTO>> ReapplyLearning(
            Guid sessionId,
            CancellationToken cancellationToken)
        {
            try
            {
                var session = await _importSessionService.ReapplyLearningAsync(sessionId, cancellationToken);
                return Ok(session);
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

        [HttpPost("{sessionId:guid}/learning/revert")]
        public async Task<ActionResult<ImportSessionDTO>> RevertSessionLearning(
            Guid sessionId,
            CancellationToken cancellationToken)
        {
            try
            {
                var session = await _importSessionService.RevertSessionLearningAsync(sessionId, cancellationToken);
                return Ok(session);
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

        [HttpDelete("{sessionId:guid}/rows")]
        public async Task<ActionResult<ImportSessionDTO>> DeleteRows(
            Guid sessionId,
            [FromBody] DeleteImportSessionRowsDTO request,
            CancellationToken cancellationToken)
        {
            try
            {
                var updatedSession = await _importSessionService.DeleteRowsAsync(
                    sessionId,
                    request.RowIds,
                    cancellationToken);

                return Ok(updatedSession);
            }
            catch (KeyNotFoundException exception)
            {
                return NotFound(new { message = exception.Message });
            }
        }
    }
}
