using System.Diagnostics;
using System.Text;
using Finance.WebAPI.Configuration;
using Finance.WebAPI.Contracts.Imports;
using Microsoft.Extensions.Options;

namespace Finance.WebAPI.Services
{
    public class TabulaPdfExtractionService : ITabulaPdfExtractionService
    {
        private readonly ILogger<TabulaPdfExtractionService> _logger;
        private readonly TabulaOptions _options;

        public TabulaPdfExtractionService(
            IOptions<TabulaOptions> options,
            ILogger<TabulaPdfExtractionService> logger)
        {
            _logger = logger;
            _options = options.Value;
        }

        public async Task<ExtractPdfImportResult> ExtractAsync(
            Stream pdfStream,
            string originalFileName,
            string? password,
            CancellationToken cancellationToken = default)
        {
            EnsureTabulaJarExists();

            var tempDirectory = Path.Combine(Path.GetTempPath(), "finance-tabula", Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(tempDirectory);

            var pdfPath = Path.Combine(tempDirectory, SanitizeFileName(originalFileName, ".pdf"));
            var csvPath = Path.Combine(tempDirectory, $"{Path.GetFileNameWithoutExtension(pdfPath)}.csv");

            try
            {
                await using (var fileStream = File.Create(pdfPath))
                {
                    await pdfStream.CopyToAsync(fileStream, cancellationToken);
                }

                var processStartInfo = BuildStartInfo(pdfPath, csvPath, password);
                using var process = new Process { StartInfo = processStartInfo };

                process.Start();

                var standardErrorTask = process.StandardError.ReadToEndAsync(cancellationToken);
                var standardOutputTask = process.StandardOutput.ReadToEndAsync(cancellationToken);

                await process.WaitForExitAsync(cancellationToken);

                var standardError = await standardErrorTask;
                var standardOutput = await standardOutputTask;

                if (process.ExitCode != 0)
                {
                    _logger.LogWarning(
                        "Tabula extraction failed for {FileName}. ExitCode={ExitCode}. stderr={StdErr}",
                        originalFileName,
                        process.ExitCode,
                        standardError);

                    ThrowKnownTabulaError(standardError, standardOutput);
                    throw new InvalidOperationException("PDF extraction failed.");
                }

                if (!File.Exists(csvPath))
                {
                    throw new InvalidOperationException("Tabula did not generate CSV output.");
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
                    _logger.LogWarning(exception, "Failed to clean up temporary Tabula directory {TempDirectory}", tempDirectory);
                }
            }
        }

        private void EnsureTabulaJarExists()
        {
            if (string.IsNullOrWhiteSpace(_options.JarPath))
            {
                throw new InvalidOperationException("Tabula jar path is not configured.");
            }

            if (!File.Exists(_options.JarPath))
            {
                throw new InvalidOperationException(
                    $"Tabula jar was not found at '{_options.JarPath}'. Update Tabula:JarPath before importing PDFs.");
            }
        }

        private ProcessStartInfo BuildStartInfo(string pdfPath, string csvPath, string? password)
        {
            var startInfo = new ProcessStartInfo
            {
                FileName = _options.JavaBinPath,
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            startInfo.ArgumentList.Add("-jar");
            startInfo.ArgumentList.Add(_options.JarPath);
            startInfo.ArgumentList.Add("--pages");
            startInfo.ArgumentList.Add(string.IsNullOrWhiteSpace(_options.Pages) ? "all" : _options.Pages);
            startInfo.ArgumentList.Add("--format");
            startInfo.ArgumentList.Add(string.IsNullOrWhiteSpace(_options.Format) ? "CSV" : _options.Format);

            if (_options.Guess)
            {
                startInfo.ArgumentList.Add("--guess");
            }

            if (string.Equals(_options.ExtractionMode, "lattice", StringComparison.OrdinalIgnoreCase))
            {
                startInfo.ArgumentList.Add("--lattice");
            }
            else
            {
                startInfo.ArgumentList.Add("--stream");
            }

            if (!string.IsNullOrWhiteSpace(password))
            {
                startInfo.ArgumentList.Add("--password");
                startInfo.ArgumentList.Add(password);
            }

            startInfo.ArgumentList.Add("--outfile");
            startInfo.ArgumentList.Add(csvPath);
            startInfo.ArgumentList.Add(pdfPath);

            return startInfo;
        }

        private static void ThrowKnownTabulaError(string standardError, string standardOutput)
        {
            var combined = $"{standardError}\n{standardOutput}";
            if (combined.Contains("password", StringComparison.OrdinalIgnoreCase) ||
                combined.Contains("encrypted", StringComparison.OrdinalIgnoreCase) ||
                combined.Contains("cannot decrypt pdf", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Incorrect PDF password or the PDF requires a password.");
            }

            if (combined.Contains("No tables found", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("No tables were found in the PDF.");
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
