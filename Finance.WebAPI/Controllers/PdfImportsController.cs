using Finance.WebAPI.Contracts.PdfImports;
using Finance.WebAPI.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace Finance.WebAPI.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class PdfImportsController : ControllerBase
    {
        private readonly IPdfImportStorageService _pdfImportStorageService;
        private readonly IPdfTableDetectionService _pdfTableDetectionService;

        public PdfImportsController(
            IPdfImportStorageService pdfImportStorageService,
            IPdfTableDetectionService pdfTableDetectionService)
        {
            _pdfImportStorageService = pdfImportStorageService;
            _pdfTableDetectionService = pdfTableDetectionService;
        }

        [HttpPost("upload")]
        [RequestSizeLimit(25 * 1024 * 1024)]
        public async Task<ActionResult<PdfImportUploadResult>> Upload(
            IFormFile file,
            CancellationToken cancellationToken)
        {
            if (file is null || file.Length == 0)
            {
                return BadRequest(new { message = "A PDF file is required." });
            }

            if (!string.Equals(Path.GetExtension(file.FileName), ".pdf", StringComparison.OrdinalIgnoreCase))
            {
                return BadRequest(new { message = "Only PDF files are supported." });
            }

            await using var stream = file.OpenReadStream();
            var result = await _pdfImportStorageService.SaveAsync(stream, file.FileName, cancellationToken);
            return Ok(result);
        }

        [HttpPost("detect-tables")]
        public async Task<ActionResult<DetectPdfTablesResult>> DetectTables(
            [FromBody] DetectPdfTablesRequest request,
            CancellationToken cancellationToken)
        {
            if (request is null || string.IsNullOrWhiteSpace(request.FileId))
            {
                return BadRequest(new { message = "A stored PDF file id is required." });
            }

            try
            {
                var result = await _pdfTableDetectionService.DetectTablesAsync(request, cancellationToken);
                return Ok(result);
            }
            catch (FileNotFoundException)
            {
                return NotFound(new { message = "The uploaded PDF could not be found." });
            }
            catch (InvalidOperationException exception)
            {
                return BadRequest(new { message = exception.Message });
            }
            catch (Exception exception)
            {
                return StatusCode(500, new { message = $"PDF table detection failed unexpectedly: {exception.Message}" });
            }
        }
    }
}
