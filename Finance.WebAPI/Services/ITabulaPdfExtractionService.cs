using Finance.WebAPI.Contracts.Imports;

namespace Finance.WebAPI.Services
{
    public interface ITabulaPdfExtractionService
    {
        Task<ExtractPdfImportResult> ExtractAsync(
            Stream pdfStream,
            string originalFileName,
            string? password,
            CancellationToken cancellationToken = default);
    }
}
