using Finance.WebAPI.Contracts.PdfImports;

namespace Finance.WebAPI.Services
{
    public interface IPdfImportStorageService
    {
        Task<PdfImportUploadResult> SaveAsync(
            Stream pdfStream,
            string originalFileName,
            CancellationToken cancellationToken = default);

        string GetAbsolutePath(string fileId);
    }
}
