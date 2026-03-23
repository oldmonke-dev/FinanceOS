using Finance.WebAPI.Contracts.Imports;

namespace Finance.WebAPI.Services
{
    public interface ICamelotPdfExtractionService
    {
        Task<ExtractPdfImportResult> ExtractAsync(
            Stream pdfStream,
            string originalFileName,
            string? password,
            CancellationToken cancellationToken = default);
    }
}
