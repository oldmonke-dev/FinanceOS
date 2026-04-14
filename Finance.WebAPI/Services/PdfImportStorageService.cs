using System.Text;
using Finance.WebAPI.Contracts.PdfImports;

namespace Finance.WebAPI.Services
{
    public class PdfImportStorageService : IPdfImportStorageService
    {
        private readonly IWebHostEnvironment _environment;

        public PdfImportStorageService(IWebHostEnvironment environment)
        {
            _environment = environment;
        }

        public async Task<PdfImportUploadResult> SaveAsync(
            Stream pdfStream,
            string originalFileName,
            CancellationToken cancellationToken = default)
        {
            var fileId = Guid.NewGuid().ToString("N");
            var storageDirectory = GetStorageDirectory();
            Directory.CreateDirectory(storageDirectory);

            var sanitizedFileName = SanitizeFileName(originalFileName);
            var storagePath = Path.Combine(storageDirectory, $"{fileId}.pdf");

            await using (var output = File.Create(storagePath))
            {
                await pdfStream.CopyToAsync(output, cancellationToken);
            }

            var bytes = await File.ReadAllBytesAsync(storagePath, cancellationToken);
            var pageCount = EstimatePdfPageCount(bytes);
            var supportsTextExtraction = LooksTextBased(bytes);

            return new PdfImportUploadResult
            {
                FileId = fileId,
                FileName = sanitizedFileName,
                FileSize = bytes.LongLength,
                PageCount = pageCount,
                SupportsTextExtraction = supportsTextExtraction,
                WarningMessage = supportsTextExtraction
                    ? null
                    : "This PDF may be image-based. Only text-based PDFs are supported.",
            };
        }

        public string GetAbsolutePath(string fileId)
        {
            if (string.IsNullOrWhiteSpace(fileId))
            {
                throw new InvalidOperationException("A PDF file id is required.");
            }

            var safeFileId = fileId.Trim();
            if (safeFileId.IndexOfAny(Path.GetInvalidFileNameChars()) >= 0)
            {
                throw new InvalidOperationException("Invalid PDF file id.");
            }

            var absolutePath = Path.Combine(GetStorageDirectory(), $"{safeFileId}.pdf");
            if (!File.Exists(absolutePath))
            {
                throw new FileNotFoundException("The uploaded PDF could not be found.", safeFileId);
            }

            return absolutePath;
        }

        private string GetStorageDirectory()
        {
            return Path.Combine(_environment.ContentRootPath, "App_Data", "pdf-imports");
        }

        private static int EstimatePdfPageCount(byte[] bytes)
        {
            var text = Encoding.Latin1.GetString(bytes);
            var matches = System.Text.RegularExpressions.Regex.Matches(
                text,
                @"/Type\s*/Page\b",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            return Math.Max(matches.Count, 1);
        }

        private static bool LooksTextBased(byte[] bytes)
        {
            var text = Encoding.Latin1.GetString(bytes);
            return text.Contains("/Font", StringComparison.OrdinalIgnoreCase) ||
                   text.Contains("BT", StringComparison.OrdinalIgnoreCase);
        }

        private static string SanitizeFileName(string fileName)
        {
            var value = Path.GetFileName(fileName);
            if (string.IsNullOrWhiteSpace(value))
            {
                return "upload.pdf";
            }

            foreach (var invalidChar in Path.GetInvalidFileNameChars())
            {
                value = value.Replace(invalidChar, '_');
            }

            return value.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase)
                ? value
                : $"{Path.GetFileNameWithoutExtension(value)}.pdf";
        }
    }
}
