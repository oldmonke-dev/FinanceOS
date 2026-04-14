import { API_BASE_URL } from "@/lib/api-config"
import { authFetch } from "@/lib/auth"

export type PdfImportUploadResult = {
  fileId: string
  fileName: string
  fileSize: number
  pageCount: number
  supportsTextExtraction: boolean
  warningMessage: string | null
}

export type PdfTableRegion = {
  id: string
  pageNumber: number
  x: number
  y: number
  width: number
  height: number
  label: string
  source: "auto"
  confidence?: number | null
}

export type DetectPdfTablesResult = {
  fileId: string
  pageCount: number
  supportsTextExtraction: boolean
  warningMessage: string | null
  regions: PdfTableRegion[]
}

export type DetectPdfTablesRequest = {
  fileId: string
  flavor: "lattice" | "stream"
  pages: string
  lineScale: string
  edgeTolerance: string
  rowTolerance: string
  columnTolerance: string
  splitText: boolean
  stripText: boolean
}

async function readErrorMessage(response: Response, fallback: string) {
  try {
    const error = (await response.json()) as { message?: string }
    return error.message ?? fallback
  } catch {
    return fallback
  }
}

export async function uploadPdfImport(file: File): Promise<PdfImportUploadResult> {
  const formData = new FormData()
  formData.append("file", file)

  const response = await authFetch(`${API_BASE_URL}/PdfImports/upload`, {
    method: "POST",
    body: formData,
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to upload PDF: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const raw = (await response.json()) as Record<string, unknown>
  return {
    fileId: String(raw.fileId ?? raw.FileId ?? ""),
    fileName: String(raw.fileName ?? raw.FileName ?? ""),
    fileSize: Number(raw.fileSize ?? raw.FileSize ?? 0),
    pageCount: Number(raw.pageCount ?? raw.PageCount ?? 1),
    supportsTextExtraction: Boolean(
      raw.supportsTextExtraction ?? raw.SupportsTextExtraction ?? false,
    ),
    warningMessage: raw.warningMessage
      ? String(raw.warningMessage)
      : raw.WarningMessage
        ? String(raw.WarningMessage)
        : null,
  }
}

export async function detectPdfTables(
  request: DetectPdfTablesRequest,
): Promise<DetectPdfTablesResult> {
  const response = await authFetch(`${API_BASE_URL}/PdfImports/detect-tables`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    throw new Error(
      await readErrorMessage(
        response,
        `Failed to detect PDF tables: ${response.status} ${response.statusText}`,
      ),
    )
  }

  const raw = (await response.json()) as Record<string, unknown>
  const rawRegions = Array.isArray(raw.regions ?? raw.Regions) ? (raw.regions ?? raw.Regions) as Record<string, unknown>[] : []

  return {
    fileId: String(raw.fileId ?? raw.FileId ?? ""),
    pageCount: Number(raw.pageCount ?? raw.PageCount ?? 1),
    supportsTextExtraction: Boolean(
      raw.supportsTextExtraction ?? raw.SupportsTextExtraction ?? false,
    ),
    warningMessage: raw.warningMessage
      ? String(raw.warningMessage)
      : raw.WarningMessage
        ? String(raw.WarningMessage)
        : null,
    regions: rawRegions.map((region) => ({
      id: String(region.id ?? region.Id ?? ""),
      pageNumber: Number(region.pageNumber ?? region.PageNumber ?? 1),
      x: Number(region.x ?? region.X ?? 0),
      y: Number(region.y ?? region.Y ?? 0),
      width: Number(region.width ?? region.Width ?? 0),
      height: Number(region.height ?? region.Height ?? 0),
      label: String(region.label ?? region.Label ?? "Auto Table"),
      source: "auto",
      confidence:
        region.confidence != null || region.Confidence != null
          ? Number(region.confidence ?? region.Confidence)
          : null,
    })),
  }
}
