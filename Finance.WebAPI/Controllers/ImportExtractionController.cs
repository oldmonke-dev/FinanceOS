using Finance.WebAPI.Contracts.Imports;
using Finance.WebAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Finance.WebAPI.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class ImportExtractionController : ControllerBase
    {
        private readonly ICamelotPdfExtractionService _camelotPdfExtractionService;

        public ImportExtractionController(ICamelotPdfExtractionService camelotPdfExtractionService)
        {
            _camelotPdfExtractionService = camelotPdfExtractionService;
        }

        [HttpPost("pdf")]
        [RequestSizeLimit(25 * 1024 * 1024)]
        public async Task<ActionResult<ExtractPdfImportResult>> ExtractPdf(
            IFormFile file,
            [FromForm] string? password,
            CancellationToken cancellationToken)
        {
            if (file is null || file.Length == 0)
            {
                return BadRequest(new { message = "A PDF file is required." });
            }

            if (!string.Equals(Path.GetExtension(file.FileName), ".pdf", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { message = "Only PDF files are supported by this endpoint." });
            }

            try
            {
                await using var stream = file.OpenReadStream();
                var result = await _camelotPdfExtractionService.ExtractAsync(
                    stream,
                    file.FileName,
                    password,
                    cancellationToken);

                return Ok(result);
            }
            catch (InvalidOperationException exception)
            {
                return BadRequest(new { message = exception.Message });
            }
        }
    }
}
