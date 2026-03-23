using Finance.BusinessLayer.DTOs.Strategies;
using Finance.BusinessLayer.Interfaces;
using Finance.WebAPI.Extensions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Finance.WebAPI.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class StrategiesController : ControllerBase
    {
        private readonly IStrategyService _strategyService;

        public StrategiesController(IStrategyService strategyService)
        {
            _strategyService = strategyService;
        }

        [HttpGet("bayesian")]
        public async Task<ActionResult<BayesianStrategyDTO>> GetBayesianStrategy(CancellationToken cancellationToken)
        {
            var strategy = await _strategyService.GetBayesianStrategyAsync(
                User.GetRequiredUserId(),
                cancellationToken);
            return Ok(strategy);
        }

        [HttpPost("bayesian/import-training")]
        public async Task<ActionResult<ImportBayesianTrainingResultDTO>> ImportBayesianTrainingData(
            [FromBody] ImportBayesianTrainingDataDTO request,
            CancellationToken cancellationToken)
        {
            var result = await _strategyService.ImportBayesianTrainingDataAsync(
                User.GetRequiredUserId(),
                request,
                cancellationToken);
            return Ok(result);
        }

        [HttpDelete("bayesian/accounts/{destinationAccountId:guid}/learning")]
        public async Task<IActionResult> DeleteBayesianLearningForAccount(
            Guid destinationAccountId,
            CancellationToken cancellationToken)
        {
            try
            {
                await _strategyService.DeleteBayesianLearningForAccountAsync(
                    User.GetRequiredUserId(),
                    destinationAccountId,
                    cancellationToken);

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
    }
}
