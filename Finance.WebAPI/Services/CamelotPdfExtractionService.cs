using System.Diagnostics;
using System.Text;
using Finance.WebAPI.Configuration;
using Finance.WebAPI.Contracts.Imports;
using Microsoft.Extensions.Options;

namespace Finance.WebAPI.Services
{
    public class CamelotPdfExtractionService : ICamelotPdfExtractionService
    {
        private readonly CamelotOptions _options;
        private readonly ILogger<CamelotPdfExtractionService> _logger;
        private readonly IWebHostEnvironment _webHostEnvironment;

        public CamelotPdfExtractionService(
            IOptions<CamelotOptions> options,
            ILogger<CamelotPdfExtractionService> logger,
            IWebHostEnvironment webHostEnvironment)
        {
            _options = options.Value;
            _logger = logger;
            _webHostEnvironment = webHostEnvironment;
        }

        public async Task<ExtractPdfImportResult> ExtractAsync(
            Stream pdfStream,
            string originalFileName,
            string? password,
            CancellationToken cancellationToken = default)
        {
            EnsureScriptExists(out var scriptPath);

            var tempDirectory = Path.Combine(Path.GetTempPath(), "finance-camelot", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDirectory);

            var pdfPath = Path.Combine(tempDirectory, SanitizeFileName(originalFileName, ".pdf"));
            var csvPath = Path.Combine(tempDirectory, $"{Path.GetFileNameWithoutExtension(pdfPath)}.csv");

            try
            {
                await using (var fileStream = File.Create(pdfPath))
                {
                    await pdfStream.CopyToAsync(fileStream, cancellationToken);
                }

                var startInfo = BuildStartInfo(scriptPath, pdfPath, csvPath, password);
                using var process = new Process { StartInfo = startInfo };

                process.Start();

                var standardOutputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
                var standardErrorTask = process.StandardError.ReadToEndAsync(cancellationToken);

                await process.WaitForExitAsync(cancellationToken);

                var standardOutput = await standardOutputTask;
                var standardError = await standardErrorTask;

                if (process.ExitCode != 0)
                {
                    _logger.LogWarning(
                        "Camelot extraction failed for {FileName}. ExitCode={ExitCode}. stderr={StdErr}",
                        originalFileName,
                        process.ExitCode,
                        standardError);

                    var message = string.IsNullOrWhiteSpace(standardError)
                        ? standardOutput
                        : standardError;

                    throw new InvalidOperationException(string.IsNullOrWhiteSpace(message)
                        ? "PDF extraction failed."
                        : message.Trim());
                }

                if (!File.Exists(csvPath))
                {
                    throw new InvalidOperationException("Camelot did not generate CSV output.");
                }

                var csvText = await File.ReadAllTextAsync(csvPath, Encoding.UTF8, cancellationToken);
                if (string.IsNullOrWhiteSpace(csvText))
                {
                    throw new InvalidOperationException("No tabular data was extracted from the PDF.");
                }

                return new ExtractPdfImportResult
                {
                    FileName = originalFileName,
                    CsvText = csvText,
                    Delimiter = ",",
                    Message = "PDF extracted successfully.",
                };
            }
            finally
            {
                try
                {
                    if (Directory.Exists(tempDirectory))
                    {
                        Directory.Delete(tempDirectory, recursive: true);
                    }
                }
                catch (Exception exception)
                {
                    _logger.LogWarning(exception, "Failed to clean up Camelot temp directory {TempDirectory}", tempDirectory);
                }
            }
        }

        private ProcessStartInfo BuildStartInfo(string scriptPath, string pdfPath, string csvPath, string? password)
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = _options.PythonBinPath,
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            startInfo.ArgumentList.Add(scriptPath);
            startInfo.ArgumentList.Add(pdfPath);
            startInfo.ArgumentList.Add(csvPath);

            if (!string.IsNullOrWhiteSpace(password))
            {
                startInfo.ArgumentList.Add(password);
            }

            return startInfo;
        }

        private void EnsureScriptExists(out string scriptPath)
        {
            scriptPath = !string.IsNullOrWhiteSpace(_options.ScriptPath)
                ? _options.ScriptPath!
                : Path.Combine(_webHostEnvironment.ContentRootPath, "Scripts", "extract_pdf.py");

            if (!File.Exists(scriptPath))
            {
                throw new InvalidOperationException(
                    $"Camelot extraction script was not found at '{scriptPath}'.");
            }
        }

        private static string SanitizeFileName(string fileName, string fallbackExtension)
        {
            var baseName = Path.GetFileName(fileName);
            if (string.IsNullOrWhiteSpace(baseName))
            {
                return $"upload{fallbackExtension}";
            }

            foreach (var invalidChar in Path.GetInvalidFileNameChars())
            {
                baseName = baseName.Replace(invalidChar, '_');
            }

            if (!baseName.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase))
            {
                return $"{Path.GetFileNameWithoutExtension(baseName)}{fallbackExtension}";
            }

            return baseName;
        }
    }
}
