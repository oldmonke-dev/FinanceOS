using System.Text.Json;
using Finance.WebAPI.Contracts.PdfImports;
using System.Net.Http.Headers;

namespace Finance.WebAPI.Services
{
    public class CamelotPdfTableDetectionService : IPdfTableDetectionService
    {
        private readonly HttpClient _httpClient;
        private readonly ILogger<CamelotPdfTableDetectionService> _logger;
        private readonly IPdfImportStorageService _pdfImportStorageService;

        public CamelotPdfTableDetectionService(
            HttpClient httpClient,
            ILogger<CamelotPdfTableDetectionService> logger,
            IPdfImportStorageService pdfImportStorageService)
        {
            _httpClient = httpClient;
            _logger = logger;
            _pdfImportStorageService = pdfImportStorageService;
        }

        public async Task<DetectPdfTablesResult> DetectTablesAsync(
            DetectPdfTablesRequest request,
            CancellationToken cancellationToken = default)
        {
            var absolutePdfPath = _pdfImportStorageService.GetAbsolutePath(request.FileId);
            using var formData = new MultipartFormDataContent();
            await using var pdfStream = File.OpenRead(absolutePdfPath);
            using var pdfContent = new StreamContent(pdfStream);
            pdfContent.Headers.ContentType = new MediaTypeHeaderValue("application/pdf");
            formData.Add(pdfContent, "file", $"{request.FileId}.pdf");
            formData.Add(new StringContent(request.FileId), "fileId");
            formData.Add(new StringContent(string.IsNullOrWhiteSpace(request.Pages) ? "1" : request.Pages), "pages");
            formData.Add(new StringContent(string.Equals(request.Flavor, "stream", StringComparison.OrdinalIgnoreCase) ? "stream" : "lattice"), "flavor");
            formData.Add(new StringContent(string.IsNullOrWhiteSpace(request.LineScale) ? "40" : request.LineScale), "lineScale");
            formData.Add(new StringContent(string.IsNullOrWhiteSpace(request.EdgeTolerance) ? "50" : request.EdgeTolerance), "edgeTolerance");
            formData.Add(new StringContent(string.IsNullOrWhiteSpace(request.RowTolerance) ? "2" : request.RowTolerance), "rowTolerance");
            formData.Add(new StringContent(string.IsNullOrWhiteSpace(request.ColumnTolerance) ? "0" : request.ColumnTolerance), "columnTolerance");
            formData.Add(new StringContent(request.SplitText ? "true" : "false"), "splitText");
            formData.Add(new StringContent(request.StripText ? "true" : "false"), "stripText");

            HttpResponseMessage response;
            try
            {
                response = await _httpClient.PostAsync("detect-tables", formData, cancellationToken);
            }
            catch (Exception exception)
            {
                _logger.LogError(exception, "Failed to call Camelot worker for {FileId}.", request.FileId);
                throw new InvalidOperationException("Failed to call the Camelot worker service.");
            }

            var responseBody = await response.Content.ReadAsStringAsync(cancellationToken);
            if (!response.IsSuccessStatusCode)
            {
                _logger.LogWarning(
                    "Camelot worker detection failed for {FileId}. StatusCode={StatusCode}. Body={Body}",
                    request.FileId,
                    (int)response.StatusCode,
                    responseBody);

                var message = TryReadWorkerMessage(responseBody)
                    ?? $"Camelot worker table detection failed with status {(int)response.StatusCode}.";
                throw new InvalidOperationException(message);
            }

            try
            {
                var result = JsonSerializer.Deserialize<DetectPdfTablesResult>(
                    responseBody,
                    new JsonSerializerOptions
                    {
                        PropertyNameCaseInsensitive = true,
                    });

                if (result is null)
                {
                    throw new InvalidOperationException("Camelot detection returned no data.");
                }

                result.FileId = request.FileId;
                return result;
            }
            catch (JsonException exception)
            {
                _logger.LogError(exception, "Failed to parse Camelot worker JSON response. Raw={Body}", responseBody);
                throw new InvalidOperationException("Camelot detection returned invalid JSON.");
            }
        }

        private static string? TryReadWorkerMessage(string responseBody)
        {
            if (string.IsNullOrWhiteSpace(responseBody))
            {
                return null;
            }

            try
            {
                using var document = JsonDocument.Parse(responseBody);
                if (document.RootElement.ValueKind == JsonValueKind.Object
                    && document.RootElement.TryGetProperty("message", out var messageElement))
                {
                    return messageElement.GetString();
                }
            }
            catch (JsonException)
            {
            }

            return null;
        }
    }
}
