import { API_BASE_URL } from "@/lib/api-config"
import { authFetch } from "@/lib/auth"

export type ExtractPdfImportResult = {
  fileName: string
  csvText: string
  delimiter: string
  message: string
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const error = (await response.json()) as { message?: string }
    return error.message ?? fallback
  } catch {
    return fallback
  }
}

export async function extractPdfImport(
  file: File,
  password: string | null,
): Promise<ExtractPdfImportResult> {
  const formData = new FormData()
  formData.append("file", file)

  if (password && password.trim().length > 0) {
    formData.append("password", password)
  }

  const response = await authFetch(`${API_BASE_URL}/ImportExtraction/pdf`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to extract PDF import data: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const raw = (await response.json()) as Record<string, unknown>

  return {
    fileName: String(raw.fileName ?? raw.FileName ?? file.name),
    csvText: String(raw.csvText ?? raw.CsvText ?? ""),
    delimiter: String(raw.delimiter ?? raw.Delimiter ?? ","),
    message: String(raw.message ?? raw.Message ?? "PDF extracted successfully."),
  }
}
