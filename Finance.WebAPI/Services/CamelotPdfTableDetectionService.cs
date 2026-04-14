using System.Diagnostics;
using System.Text.Json;
using System.ComponentModel;
using Finance.WebAPI.Configuration;
using Finance.WebAPI.Contracts.PdfImports;
using Microsoft.Extensions.Options;

namespace Finance.WebAPI.Services
{
    public class CamelotPdfTableDetectionService : IPdfTableDetectionService
    {
        private readonly CamelotOptions _options;
        private readonly IWebHostEnvironment _environment;
        private readonly ILogger<CamelotPdfTableDetectionService> _logger;
        private readonly IPdfImportStorageService _pdfImportStorageService;

        public CamelotPdfTableDetectionService(
            IOptions<CamelotOptions> options,
            IWebHostEnvironment environment,
            ILogger<CamelotPdfTableDetectionService> logger,
            IPdfImportStorageService pdfImportStorageService)
        {
            _options = options.Value;
            _environment = environment;
            _logger = logger;
            _pdfImportStorageService = pdfImportStorageService;
        }

        public async Task<DetectPdfTablesResult> DetectTablesAsync(
            DetectPdfTablesRequest request,
            CancellationToken cancellationToken = default)
        {
            var absolutePdfPath = _pdfImportStorageService.GetAbsolutePath(request.FileId);
            var startInfo = BuildStartInfo(absolutePdfPath, request);
            using var process = new Process { StartInfo = startInfo };

            try
            {
                process.Start();
            }
            catch (Win32Exception exception)
            {
                _logger.LogError(exception, "Failed to start Camelot Python process. FileName={FileName}", startInfo.FileName);
                throw new InvalidOperationException(
                    $"Failed to start the Camelot Python process using '{startInfo.FileName}'. Update Camelot:PythonBinPath and ensure Camelot is installed in that Python environment.");
            }
            catch (Exception exception)
            {
                _logger.LogError(exception, "Unexpected error while starting Camelot detection process.");
                throw new InvalidOperationException("Failed to start Camelot table detection.");
            }

            var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);

            await process.WaitForExitAsync(cancellationToken);

            var stdout = await stdoutTask;
            var stderr = await stderrTask;

            if (process.ExitCode != 0)
            {
                _logger.LogWarning(
                    "Camelot detection failed for {FileId}. ExitCode={ExitCode}. stderr={StdErr}",
                    request.FileId,
                    process.ExitCode,
                    stderr);

                var message = string.IsNullOrWhiteSpace(stderr)
                    ? "Camelot table detection failed."
                    : stderr.Trim();
                throw new InvalidOperationException(message);
            }

            try
            {
                var result = JsonSerializer.Deserialize<DetectPdfTablesResult>(
                    stdout,
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
                _logger.LogError(exception, "Failed to parse Camelot JSON response. Raw={StdOut}", stdout);
                throw new InvalidOperationException("Camelot detection returned invalid JSON.");
            }
        }

        private ProcessStartInfo BuildStartInfo(string pdfPath, DetectPdfTablesRequest request)
        {
            var scriptPath = ResolveScriptPath();
            var pythonBinPath = string.IsNullOrWhiteSpace(_options.PythonBinPath) ? "python" : _options.PythonBinPath;
            var startInfo = new ProcessStartInfo
            {
                FileName = pythonBinPath,
                RedirectStandardError = true,
                RedirectStandardOutput = true,
                UseShellExecute = false,
                CreateNoWindow = true,
            };

            if (!string.IsNullOrWhiteSpace(_options.WorkingDirectory))
            {
                startInfo.WorkingDirectory = Path.IsPathRooted(_options.WorkingDirectory)
                    ? _options.WorkingDirectory
                    : Path.GetFullPath(Path.Combine(_environment.ContentRootPath, _options.WorkingDirectory));
            }

            startInfo.ArgumentList.Add(scriptPath);
            startInfo.ArgumentList.Add("--pdf");
            startInfo.ArgumentList.Add(pdfPath);
            startInfo.ArgumentList.Add("--pages");
            startInfo.ArgumentList.Add(string.IsNullOrWhiteSpace(request.Pages) ? "1" : request.Pages);
            startInfo.ArgumentList.Add("--flavor");
            startInfo.ArgumentList.Add(string.Equals(request.Flavor, "stream", StringComparison.OrdinalIgnoreCase) ? "stream" : "lattice");
            startInfo.ArgumentList.Add("--line-scale");
            startInfo.ArgumentList.Add(string.IsNullOrWhiteSpace(request.LineScale) ? "40" : request.LineScale);
            startInfo.ArgumentList.Add("--edge-tolerance");
            startInfo.ArgumentList.Add(string.IsNullOrWhiteSpace(request.EdgeTolerance) ? "50" : request.EdgeTolerance);
            startInfo.ArgumentList.Add("--row-tolerance");
            startInfo.ArgumentList.Add(string.IsNullOrWhiteSpace(request.RowTolerance) ? "2" : request.RowTolerance);
            startInfo.ArgumentList.Add("--column-tolerance");
            startInfo.ArgumentList.Add(string.IsNullOrWhiteSpace(request.ColumnTolerance) ? "0" : request.ColumnTolerance);
            startInfo.ArgumentList.Add("--split-text");
            startInfo.ArgumentList.Add(request.SplitText ? "true" : "false");
            startInfo.ArgumentList.Add("--strip-text");
            startInfo.ArgumentList.Add(request.StripText ? "true" : "false");

            return startInfo;
        }

        private string ResolveScriptPath()
        {
            var configuredPath = string.IsNullOrWhiteSpace(_options.ScriptPath)
                ? Path.Combine("Scripts", "detect_tables.py")
                : _options.ScriptPath;
            var absolutePath = Path.IsPathRooted(configuredPath)
                ? configuredPath
                : Path.GetFullPath(Path.Combine(_environment.ContentRootPath, configuredPath));

            if (!File.Exists(absolutePath))
            {
                throw new InvalidOperationException($"Camelot script was not found at '{absolutePath}'.");
            }

            return absolutePath;
        }
    }
}
