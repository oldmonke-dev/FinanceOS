using Finance.WebAPI.Contracts.PdfImports;

namespace Finance.WebAPI.Services
{
    public interface IPdfTableDetectionService
    {
        Task<DetectPdfTablesResult> DetectTablesAsync(
            DetectPdfTablesRequest request,
            CancellationToken cancellationToken = default);
    }
}
