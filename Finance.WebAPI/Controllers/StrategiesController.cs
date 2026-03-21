using Finance.BusinessLayer.DTOs.Strategies;
using Finance.BusinessLayer.Interfaces;
using Microsoft.AspNetCore.Mvc;

namespace Finance.WebAPI.Controllers
{
    [ApiController]
    [Route("[controller]")]
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
            var strategy = await _strategyService.GetBayesianStrategyAsync(cancellationToken);
            return Ok(strategy);
        }

        [HttpPost("bayesian/import-training")]
        public async Task<ActionResult<ImportBayesianTrainingResultDTO>> ImportBayesianTrainingData(
            [FromBody] ImportBayesianTrainingDataDTO request,
            CancellationToken cancellationToken)
        {
            var result = await _strategyService.ImportBayesianTrainingDataAsync(request, cancellationToken);
            return Ok(result);
        }
    }
}
