"use client"

import {
  type ChangeEvent,
  memo,
  startTransition,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { Check, FileLock, Filter, LoaderCircle, Upload } from "lucide-react"
import { useRouter } from "next/navigation"

import { AccountSearchSelect } from "@/components/account-search-select"
import { AppShell } from "@/components/app-shell"
import { useAccounts } from "@/components/providers/accounts-provider"
import { useConfirmationDialog } from "@/components/providers/confirmation-dialog-provider"
import { useImportSessions } from "@/components/providers/import-sessions-provider"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { extractPdfImport } from "@/lib/import-extraction"
import { type Account } from "@/models/account"

type ParsedCsv = {
  rows: string[][]
  maxColumns: number
}

type Delimiter = "," | ";" | "\t" | "|"
type ImportField =
  | "unmapped"
  | "date"
  | "description"
  | "amount"
  | "amount_negate"
  | "account"
  | "reference"
  | "memo"

const delimiterOptions: { label: string; value: Delimiter }[] = [
  { label: "Comma", value: "," },
  { label: "Semicolon", value: ";" },
  { label: "Tab", value: "\t" },
  { label: "Pipe", value: "|" },
]

const importFieldOptions: { label: string; value: ImportField }[] = [
  { label: "Unmapped", value: "unmapped" },
  { label: "Date", value: "date" },
  { label: "Description", value: "description" },
  { label: "Amount (+/-)", value: "amount" },
  { label: "Amount Negate", value: "amount_negate" },
  { label: "Account", value: "account" },
  { label: "Reference", value: "reference" },
  { label: "Memo", value: "memo" },
]

const sampleCsv = `Date,Description,Amount,Account,Reference
2026-03-01,Salary,3000,Bank,PAY-1001
2026-03-02,Rent,-1200,Bank,RENT-MAR
2026-03-03,Coffee,-6.5,Cash,POS-442`

export default function ImportPage() {
  const router = useRouter()
  const { accounts, errorMessage, isLoading } = useAccounts()
  const { alert } = useConfirmationDialog()
  const { createSession } = useImportSessions()
  const [selectedSourceAccountId, setSelectedSourceAccountId] = useState<string>("")
  const [rawCsv, setRawCsv] = useState(sampleCsv)
  const [delimiter, setDelimiter] = useState<Delimiter>(",")
  const [hasHeaderRow, setHasHeaderRow] = useState(true)
  const [trimWhitespace, setTrimWhitespace] = useState(true)
  const [skipEmptyRows, setSkipEmptyRows] = useState(true)
  const [rowsToSkip, setRowsToSkip] = useState(0)
  const [mergeDescriptionContinuationRows, setMergeDescriptionContinuationRows] = useState(false)
  const [previewMode, setPreviewMode] = useState<"limited" | "all" | "range">("limited")
  const [previewLimit, setPreviewLimit] = useState(12)
  const [previewRangeStart, setPreviewRangeStart] = useState(1)
  const [previewRangeEnd, setPreviewRangeEnd] = useState(25)
  const [usePreviewAsImportSelection, setUsePreviewAsImportSelection] = useState(false)
  const [selectedImportRows, setSelectedImportRows] = useState<Set<number>>(new Set())
  const [expandedDescriptionRows, setExpandedDescriptionRows] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState("")
  const [columnMappings, setColumnMappings] = useState<Record<number, ImportField>>({})
  const [fileName, setFileName] = useState<string | null>(null)
  const [importMessage, setImportMessage] = useState<{
    tone: "success" | "error"
    text: string
  } | null>(null)
  const [pendingPdfFile, setPendingPdfFile] = useState<File | null>(null)
  const [isPdfPasswordDialogOpen, setIsPdfPasswordDialogOpen] = useState(false)
  const [pdfPassword, setPdfPassword] = useState("")
  const [pdfPasswordError, setPdfPasswordError] = useState<string | null>(null)
  const [isExtractingPdf, setIsExtractingPdf] = useState(false)
  const [isLoadingSourceFile, setIsLoadingSourceFile] = useState(false)
  const [splitPartCount, setSplitPartCount] = useState<2 | 3 | 4 | 5>(2)
  const [isSplitDialogOpen, setIsSplitDialogOpen] = useState(false)
  const [isCreatingSplitSessions, setIsCreatingSplitSessions] = useState(false)
  const deferredRawCsv = useDeferredValue(rawCsv)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!selectedSourceAccountId && accounts.length > 0) {
      setSelectedSourceAccountId(accounts[0].id)
    }
  }, [accounts, selectedSourceAccountId])

  const parsed = useMemo(
    () => parseCsv(deferredRawCsv, delimiter, trimWhitespace, skipEmptyRows),
    [deferredRawCsv, delimiter, trimWhitespace, skipEmptyRows],
  )

  const skippedRowIndexes = useMemo(() => {
    const indexes = new Set<number>()

    for (let index = 0; index < Math.min(rowsToSkip, parsed.rows.length); index += 1) {
      indexes.add(index)
    }

    return indexes
  }, [parsed.rows.length, rowsToSkip])
  const rowsAfterSkip = useMemo(
    () => parsed.rows.filter((_, index) => !skippedRowIndexes.has(index)),
    [parsed.rows, skippedRowIndexes],
  )
  const rowsAfterInclude = useMemo(
    () =>
      mergeDescriptionContinuationRows
        ? mergeContinuationDescriptionRows(rowsAfterSkip, hasHeaderRow)
        : rowsAfterSkip,
    [hasHeaderRow, mergeDescriptionContinuationRows, rowsAfterSkip],
  )
  const maxColumns = parsed.maxColumns
  const defaultHeaders = useMemo(
    () => Array.from({ length: maxColumns }, (_, index) => `Column ${index + 1}`),
    [maxColumns],
  )
  const headers = useMemo(
    () =>
      hasHeaderRow && rowsAfterInclude.length > 0
        ? rowsAfterInclude[0].map((value, index) => value || `Column ${index + 1}`)
        : defaultHeaders,
    [defaultHeaders, hasHeaderRow, rowsAfterInclude],
  )

  const dataRows = useMemo(
    () => (hasHeaderRow ? rowsAfterInclude.slice(1) : rowsAfterInclude),
    [hasHeaderRow, rowsAfterInclude],
  )

  useEffect(() => {
    setColumnMappings((current) => {
      const next: Record<number, ImportField> = {}

      headers.forEach((header, index) => {
        next[index] = current[index] ?? inferImportField(header)
      })

      const currentEntries = Object.entries(current)
      const nextEntries = Object.entries(next)

      if (
        currentEntries.length === nextEntries.length &&
        nextEntries.every(([key, value]) => current[Number(key)] === value)
      ) {
        return current
      }

      return next
    })
  }, [headers])

  const visibleColumnIndexes = headers.map((_, index) => index)
  const filteredRows = useMemo(
    () =>
      dataRows
        .map((row, index) => ({ row, sourceIndex: index }))
        .filter(({ row }) => {
          if (!search.trim()) {
            return true
          }

          return row.join(" ").toLowerCase().includes(search.trim().toLowerCase())
        }),
    [dataRows, search],
  )

  const previewRows = useMemo(() => {
    if (previewMode === "all") {
      return filteredRows
    }

    if (previewMode === "range") {
      const startIndex = Math.max(previewRangeStart - 1, 0)
      const endIndex = Math.max(previewRangeEnd, startIndex)
      return filteredRows.slice(startIndex, endIndex)
    }

    return filteredRows.slice(0, previewLimit)
  }, [filteredRows, previewLimit, previewMode, previewRangeEnd, previewRangeStart])

  const allPreviewRowsSelected =
    previewRows.length > 0 &&
    previewRows.every(({ sourceIndex }) => selectedImportRows.has(sourceIndex))

  const rowsForImport = useMemo(() => {
    if (usePreviewAsImportSelection) {
      return previewRows.filter(({ sourceIndex }) => selectedImportRows.has(sourceIndex))
    }

    return filteredRows
  }, [filteredRows, previewRows, selectedImportRows, usePreviewAsImportSelection])

  const splitPreviewGroups = useMemo(
    () => splitRowsEvenly(rowsForImport, splitPartCount),
    [rowsForImport, splitPartCount],
  )
  const selectedSourceAccount =
    accounts.find((account) => String(account.id) === selectedSourceAccountId) ?? null
  const accountColumnIndex = useMemo(
    () =>
      Object.entries(columnMappings).find(([, value]) => value === "account")?.[0] != null
        ? Number(
            Object.entries(columnMappings).find(([, value]) => value === "account")?.[0],
          )
        : -1,
    [columnMappings],
  )
  const accountLookup = useMemo(
    () => new Map(accounts.map((account) => [normalizeAccountName(account.name), account])),
    [accounts],
  )

  useEffect(() => {
    if (usePreviewAsImportSelection) {
      const nextIndexes = previewRows.map(({ sourceIndex }) => sourceIndex)

      setSelectedImportRows((current) => {
        if (
          current.size === nextIndexes.length &&
          nextIndexes.every((sourceIndex) => current.has(sourceIndex))
        ) {
          return current
        }

        return new Set(nextIndexes)
      })
      return
    }

    setSelectedImportRows((current) => (current.size === 0 ? current : new Set()))
  }, [previewRows, usePreviewAsImportSelection])

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsLoadingSourceFile(true)
    setImportMessage(null)

    const lowerCaseName = file.name.toLowerCase()
    if (lowerCaseName.endsWith(".pdf") || file.type === "application/pdf") {
      setPendingPdfFile(file)
      setPdfPassword("")
      setPdfPasswordError(null)
      setIsPdfPasswordDialogOpen(true)
      setIsLoadingSourceFile(false)
      event.target.value = ""
      return
    }

    try {
      const text = await file.text()
      startTransition(() => {
        setRawCsv(text)
      })
      setFileName(file.name)
      setImportMessage({
        tone: "success",
        text: `Loaded CSV file ${file.name}.`,
      })
    } finally {
      setIsLoadingSourceFile(false)
      event.target.value = ""
    }
  }

  async function submitPdfForExtraction() {
    if (!pendingPdfFile) {
      return
    }

    setIsExtractingPdf(true)
    setIsLoadingSourceFile(true)
    setPdfPasswordError(null)

    try {
      const result = await extractPdfImport(pendingPdfFile, pdfPassword || null)

      startTransition(() => {
        setRawCsv(result.csvText)
      })
      setFileName(result.fileName)
      setImportMessage({
        tone: "success",
        text: result.message,
      })
      setIsPdfPasswordDialogOpen(false)
      setPendingPdfFile(null)
      setPdfPassword("")
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to extract PDF import data."
      setImportMessage({
        tone: "error",
        text: message,
      })

      if (message.toLowerCase().includes("password")) {
        setPdfPasswordError(message)
      } else {
        setIsPdfPasswordDialogOpen(false)
        setPendingPdfFile(null)
      }
    } finally {
      setIsExtractingPdf(false)
      setIsLoadingSourceFile(false)
    }
  }

  function closePdfPasswordDialog() {
    if (isExtractingPdf) {
      return
    }

    setIsPdfPasswordDialogOpen(false)
    setPendingPdfFile(null)
    setPdfPassword("")
    setPdfPasswordError(null)
  }

  function downloadPreviewAsCsv() {
    if (previewRows.length === 0) {
      return
    }

    const csvRows: string[] = []
    csvRows.push(headers.map(escapeCsvCell).join(","))
    csvRows.push(
      headers
        .map((_, index) => escapeCsvCell(columnMappings[index] ?? "unmapped"))
        .join(","),
    )

    for (const { row } of previewRows) {
      const normalizedRow = headers.map((_, index) => escapeCsvCell(row[index] ?? ""))
      csvRows.push(normalizedRow.join(","))
    }

    const blob = new Blob([csvRows.join("\r\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    const baseName = (fileName ?? "import-preview").replace(/\.[^.]+$/, "")
    anchor.href = url
    anchor.download = `${baseName}-preview.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function resetColumns() {
    setColumnMappings(
      Object.fromEntries(headers.map((header, index) => [index, inferImportField(header)])),
    )
  }

  function updateColumnMapping(columnIndex: number, nextValue: string) {
    setColumnMappings((current) => ({
      ...current,
      [columnIndex]: nextValue as ImportField,
    }))
  }

  function toggleImportRow(sourceIndex: number) {
    setSelectedImportRows((current) => {
      const next = new Set(current)

      if (next.has(sourceIndex)) {
        next.delete(sourceIndex)
      } else {
        next.add(sourceIndex)
      }

      return next
    })
  }

  function toggleAllPreviewRows() {
    setSelectedImportRows((current) => {
      const next = new Set(current)

      if (allPreviewRowsSelected) {
        previewRows.forEach(({ sourceIndex }) => {
          next.delete(sourceIndex)
        })
      } else {
        previewRows.forEach(({ sourceIndex }) => {
          next.add(sourceIndex)
        })
      }

      return next
    })
  }

  async function createImportSessionFromPreview() {
    const session = await createSession({
      fileName,
      sourceAccountId: selectedSourceAccount?.id ?? null,
      label: "user_imports",
      strategy: "unassigned",
      columnMappings,
      rows: rowsForImport.map(({ row, sourceIndex }) => ({
        rowIndex: sourceIndex,
        values: row,
        ...resolveDestinationAccount(row, accountColumnIndex, accountLookup),
      })),
    })

    router.push(`/import-sessions#${session.id}`)
  }

  async function createSplitImportSessionsFromPreview() {
    if (rowsForImport.length < splitPartCount) {
      await alert({
        title: "Not enough rows",
        message: `Need at least ${splitPartCount} selected rows to create ${splitPartCount} split sessions.`,
      })
      return
    }

    setIsCreatingSplitSessions(true)

    try {
      const rowGroups = splitRowsEvenly(rowsForImport, splitPartCount)
      const splitTitleBase = buildSplitSessionTitleBase(fileName)
      let firstSessionId: string | null = null

      for (let index = 0; index < rowGroups.length; index += 1) {
        const session = await createSession({
          fileName: `${splitTitleBase}_Split_Part${index + 1}`,
          sourceAccountId: selectedSourceAccount?.id ?? null,
          label: "user_import_chunked",
          strategy: "unassigned",
          columnMappings,
          rows: rowGroups[index].map(({ row, sourceIndex }) => ({
            rowIndex: sourceIndex,
            values: row,
            ...resolveDestinationAccount(row, accountColumnIndex, accountLookup),
          })),
        })

        if (!firstSessionId) {
          firstSessionId = session.id
        }
      }

      router.push(firstSessionId ? `/import-sessions#${firstSessionId}` : "/import-sessions")
    } finally {
      setIsCreatingSplitSessions(false)
      setIsSplitDialogOpen(false)
    }
  }

  function toggleExpandedDescription(rowKey: string) {
    setExpandedDescriptionRows((current) => {
      const next = new Set(current)
      if (next.has(rowKey)) {
        next.delete(rowKey)
      } else {
        next.add(rowKey)
      }
      return next
    })
  }

  return (
    <AppShell
      title="Importer"
      subtitle="Load CSV or PDF files, preview mapped rows, then create an import session"
      badge={isLoading ? "Loading accounts" : `${previewRows.length} preview rows`}
    >
      <section className="grid min-w-0 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <article className="min-w-0 rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <Upload className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Source</h2>
              <p className="text-sm text-muted-foreground">
                Choose CSV or PDF files, or paste CSV text directly for preview and mapping.
              </p>
              <p className="mt-1 text-xs text-amber-700">
                PDF import via Tabula is experimental.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-2 text-sm">
            <span className="font-medium">Choose CSV or PDF files</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,.pdf,application/pdf"
              onChange={handleFileChange}
              className="sr-only"
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 w-full justify-start"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoadingSourceFile}
            >
              {isLoadingSourceFile ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  {isExtractingPdf ? "Importing PDF with Tabula..." : "Loading CSV file..."}
                </>
              ) : (
                "Choose CSV or PDF files"
              )}
            </Button>
          </div>

          <div className="mt-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
            {fileName ? `Loaded file: ${fileName}` : "No file selected. Using pasted/sample text."}
          </div>

          {isLoadingSourceFile ? (
            <div className="mt-3 flex items-center gap-2 rounded-2xl border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              <span>{isExtractingPdf ? "Tabula is extracting rows from the PDF..." : "Reading CSV file..."}</span>
            </div>
          ) : null}

          {importMessage ? (
            <div
              className={`mt-3 rounded-2xl border px-4 py-3 text-sm ${
                importMessage.tone === "success"
                  ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                  : "border-destructive/30 bg-destructive/5 text-destructive"
              }`}
            >
              {importMessage.text}
            </div>
          ) : null}

          <label className="mt-4 block space-y-2 text-sm">
            <span className="font-medium">Raw CSV</span>
            <textarea
              value={rawCsv}
              onChange={(event) => {
                const nextValue = event.target.value
                startTransition(() => {
                  setRawCsv(nextValue)
                })
              }}
              className="min-h-72 w-full rounded-2xl border border-input bg-background/70 px-3 py-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              spellCheck={false}
            />
          </label>
        </article>

        <article className="min-w-0 rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <Filter className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Import options</h2>
              <p className="text-sm text-muted-foreground">
                Shape the preview before import.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium">Delimiter</span>
                <Select value={delimiter} onValueChange={(value) => setDelimiter(value as Delimiter)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {delimiterOptions.map((option) => (
                      <SelectItem key={option.label} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium">Skip first rows</span>
                <Input
                  type="number"
                  min="0"
                  value={rowsToSkip}
                  onChange={(event) => setRowsToSkip(Number(event.target.value || 0))}
                />
              </label>

              <label className="flex items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm">
                <Checkbox
                  checked={hasHeaderRow}
                  onCheckedChange={(checked) => setHasHeaderRow(checked === true)}
                />
                <span>First remaining row is header</span>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm">
                <Checkbox
                  checked={trimWhitespace}
                  onCheckedChange={(checked) => setTrimWhitespace(checked === true)}
                />
                <span>Trim whitespace per cell</span>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm md:col-span-2">
                <Checkbox
                  checked={skipEmptyRows}
                  onCheckedChange={(checked) => setSkipEmptyRows(checked === true)}
                />
                <span>Remove empty rows</span>
              </label>

              <label className="flex items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm md:col-span-2">
                <Checkbox
                  checked={mergeDescriptionContinuationRows}
                  onCheckedChange={(checked) =>
                    setMergeDescriptionContinuationRows(checked === true)
                  }
                />
                <div>
                  <p className="font-medium">Merge PDF description continuation rows</p>
                  <p className="text-muted-foreground">
                    Joins rows where only the description column has text and the rest of the row is blank or "-".
                  </p>
                </div>
              </label>
            </div>

            <div className="border-t" />

            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm">
                <span className="font-medium">Preview row limit</span>
                <Input
                  type="number"
                  min="1"
                  value={previewLimit}
                  onChange={(event) => setPreviewLimit(Number(event.target.value || 1))}
                  disabled={previewMode !== "limited"}
                />
              </label>

              <label className="space-y-2 text-sm">
                <span className="font-medium">Preview mode</span>
                <Select
                  value={previewMode}
                  onValueChange={(value) => setPreviewMode(value as "limited" | "all" | "range")}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="limited">Limited</SelectItem>
                    <SelectItem value="all">Preview all</SelectItem>
                    <SelectItem value="range">Custom range</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <div className="space-y-2 text-sm md:col-span-2">
                <span className="font-medium">Custom row range</span>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={previewRangeStart}
                    onChange={(event) => setPreviewRangeStart(Number(event.target.value || 1))}
                    disabled={previewMode !== "range"}
                    placeholder="Start"
                  />
                  <Input
                    type="number"
                    min="1"
                    value={previewRangeEnd}
                    onChange={(event) => setPreviewRangeEnd(Number(event.target.value || 1))}
                    disabled={previewMode !== "range"}
                    placeholder="End"
                  />
                </div>
              </div>

              <label className="flex items-center gap-3 rounded-2xl border bg-background/70 px-4 py-3 text-sm md:col-span-2">
                <Checkbox
                  checked={usePreviewAsImportSelection}
                  onCheckedChange={(checked) => setUsePreviewAsImportSelection(checked === true)}
                />
                <span>Include only preview plus selected</span>
              </label>
            </div>
          </div>

          <div className="mt-5 rounded-3xl border bg-background/70 p-4 text-sm text-muted-foreground">
            Parsed rows: {parsed.rows.length} | Visible columns: {visibleColumnIndexes.length} |
            Filtered rows: {filteredRows.length}
          </div>
        </article>
      </section>

      <section>
        <article className="min-w-0 rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Preview</h2>
              <p className="text-sm text-muted-foreground">
                Inspect the CSV directly and map each header inline before import.
              </p>
            </div>

            <div className="grid w-full gap-4 md:max-w-4xl md:grid-cols-[minmax(0,1fr)_auto]">
              <label className="space-y-2 text-sm">
                <span className="font-medium">Search preview rows</span>
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter visible rows"
                />
              </label>
              <div className="flex items-end">
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={resetColumns}>
                    Reset preview
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={downloadPreviewAsCsv}
                    disabled={previewRows.length === 0}
                  >
                    Download preview as CSV
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsSplitDialogOpen(true)}
                    disabled={rowsForImport.length < 2}
                  >
                    Create split sessions
                  </Button>
                  <Button
                    type="button"
                    onClick={() => void createImportSessionFromPreview()}
                    disabled={rowsForImport.length === 0}
                  >
                    Create import session
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border bg-background/70 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h3 className="font-medium">Source account</h3>
                <p className="text-sm text-muted-foreground">
                  Pick the account this imported file belongs to.
                </p>
              </div>

              <SourceAccountPicker
                accounts={accounts}
                selectedSourceAccountId={selectedSourceAccountId}
                onSelect={setSelectedSourceAccountId}
              />
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              Could not load source accounts: {errorMessage}
            </div>
          ) : null}

          <div data-horizontal-scroll-region className="horizontal-scroll-region mt-5 max-w-full rounded-2xl border">
            <table className="w-full min-w-[52rem] table-fixed border-collapse text-sm">
              <thead className="bg-muted/60">
                <tr>
                  {usePreviewAsImportSelection ? (
                    <th className="w-16 border-b px-4 py-3 text-center align-top">
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-sm font-medium leading-none">Import</span>
                        <SelectionToggle
                          checked={allPreviewRowsSelected}
                          onToggle={toggleAllPreviewRows}
                          ariaLabel="Select all preview rows"
                        />
                      </div>
                    </th>
                  ) : null}
                  {visibleColumnIndexes.map((columnIndex) => (
                    <th
                      key={`header-${columnIndex}`}
                      className="w-56 border-b px-4 py-3 text-left align-top"
                    >
                      <div className="flex w-48 max-w-full flex-col gap-2">
                        <p className="text-sm font-medium leading-none">Column {columnIndex + 1}</p>

                        <label className="block">
                          <Select
                            value={columnMappings[columnIndex] ?? "unmapped"}
                            onValueChange={(value) => updateColumnMapping(columnIndex, value)}
                          >
                            <SelectTrigger
                              className={
                                (columnMappings[columnIndex] ?? "unmapped") === "unmapped"
                                  ? "border-slate-300 bg-slate-200 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                  : ""
                              }
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {importFieldOptions.map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </label>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {previewRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={Math.max(
                        visibleColumnIndexes.length + (usePreviewAsImportSelection ? 1 : 0),
                        1,
                      )}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      No rows match the current settings.
                    </td>
                  </tr>
                ) : (
                  previewRows.map(({ row, sourceIndex }, rowIndex) => (
                    <tr key={`row-${sourceIndex}-${rowIndex}`} className="odd:bg-muted/10 even:bg-muted/35">
                      {usePreviewAsImportSelection ? (
                        <td className="border-t px-4 py-3 text-center align-top">
                          <SelectionToggle
                            checked={selectedImportRows.has(sourceIndex)}
                            onToggle={() => toggleImportRow(sourceIndex)}
                            ariaLabel={`Select row ${rowIndex + 1} for import`}
                          />
                        </td>
                      ) : null}
                      {visibleColumnIndexes.map((columnIndex) => (
                        <td
                          key={`cell-${rowIndex}-${columnIndex}`}
                          className={`border-t px-4 py-3 align-top ${
                            (columnMappings[columnIndex] ?? "unmapped") === "unmapped"
                              ? "bg-slate-100 text-slate-600 dark:bg-slate-900/60 dark:text-slate-400"
                              : ""
                          }`}
                        >
                          {(columnMappings[columnIndex] ?? "unmapped") === "description" ? (
                            <ExpandableDescriptionCell
                              value={row[columnIndex] ?? ""}
                              rowKey={`${sourceIndex}-${columnIndex}`}
                              expandedRows={expandedDescriptionRows}
                              onToggle={toggleExpandedDescription}
                            />
                          ) : (
                            <div className="max-w-48 truncate">{row[columnIndex] ?? ""}</div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-5 rounded-2xl border bg-background/70 p-4 text-sm text-muted-foreground">
            Mock import summary: {filteredRows.length} rows, {visibleColumnIndexes.length} visible
            columns, source account {selectedSourceAccount ? selectedSourceAccount.name : "Unassigned"},
            selected for import {rowsForImport.length}.
          </div>
        </article>
      </section>

      {isSplitDialogOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-lg rounded-3xl border bg-card p-6 shadow-xl">
            <div className="space-y-2">
              <div>
                <h3 className="text-lg font-semibold">Create Split Sessions</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Choose how many split sessions to create from the current import set.
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2 md:items-end">
              <label className="space-y-2 text-sm">
                <span className="font-medium">How many splits</span>
                <Select
                  value={String(splitPartCount)}
                  onValueChange={(value) => setSplitPartCount(Number(value) as 2 | 3 | 4 | 5)}
                >
                  <SelectTrigger className="h-11 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="2">2 Splits</SelectItem>
                    <SelectItem value="3">3 Splits</SelectItem>
                    <SelectItem value="4">4 Splits</SelectItem>
                    <SelectItem value="5">5 Splits</SelectItem>
                  </SelectContent>
                </Select>
              </label>

              <div className="space-y-2 text-sm">
                <span className="font-medium">Transaction count</span>
                <div className="flex h-11 w-full items-center rounded-2xl border bg-background/70 px-4 text-sm text-muted-foreground">
                  Total transactions:
                  <span className="ml-1 font-medium text-foreground">{rowsForImport.length}</span>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border bg-background/70 p-4">
              <p className="text-sm font-medium text-foreground">Transactions in each split</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {splitPreviewGroups.map((group, index) => (
                  <div
                    key={`split-preview-${index + 1}`}
                    className="rounded-xl border bg-card px-3 py-2 text-sm"
                  >
                    <span className="font-medium">Split Part {index + 1}</span>
                    <span className="ml-2 text-muted-foreground">{group.length} txns</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSplitDialogOpen(false)}
                disabled={isCreatingSplitSessions}
              >
                Close
              </Button>
              <Button
                type="button"
                onClick={() => void createSplitImportSessionsFromPreview()}
                disabled={rowsForImport.length < splitPartCount || isCreatingSplitSessions}
              >
                {isCreatingSplitSessions ? "Creating..." : "Confirm Create Session"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <DialogPrimitive.Root
        open={isPdfPasswordDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            closePdfPasswordDialog()
          }
        }}
      >
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[200] bg-black/45" />
          <DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-[201] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-3xl border bg-card p-6 shadow-xl">
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <FileLock className="size-5" />
              </div>
              <div className="space-y-2">
                <DialogPrimitive.Title className="text-lg font-semibold">
                  PDF password
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-sm text-muted-foreground">
                  Enter the PDF password if the file is protected. Leave it blank if the PDF is not password protected.
                </DialogPrimitive.Description>
              </div>
            </div>

            {pendingPdfFile ? (
              <div className="mt-4 rounded-2xl border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                Selected PDF: {pendingPdfFile.name}
              </div>
            ) : null}

            <label className="mt-4 block space-y-2 text-sm">
              <span className="font-medium">Password</span>
              <Input
                type="password"
                value={pdfPassword}
                onChange={(event) => {
                  setPdfPassword(event.target.value)
                  if (pdfPasswordError) {
                    setPdfPasswordError(null)
                  }
                }}
                placeholder="Optional"
                autoFocus
              />
            </label>

            {pdfPasswordError ? (
              <div className="mt-3 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                {pdfPasswordError}
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={closePdfPasswordDialog} disabled={isExtractingPdf}>
                Cancel
              </Button>
              <Button type="button" onClick={() => void submitPdfForExtraction()} disabled={!pendingPdfFile || isExtractingPdf}>
                {isExtractingPdf ? "Extracting..." : "Extract PDF"}
              </Button>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </AppShell>
  )
}

function parseCsv(
  source: string,
  delimiter: Delimiter,
  trimWhitespace: boolean,
  skipEmptyRows: boolean,
): ParsedCsv {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ""
  let insideQuotes = false

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index]
    const nextChar = source[index + 1]

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }
      continue
    }

    if (!insideQuotes && char === delimiter) {
      currentRow.push(normalizeCell(currentCell, trimWhitespace))
      currentCell = ""
      continue
    }

    if (!insideQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") {
        index += 1
      }

      currentRow.push(normalizeCell(currentCell, trimWhitespace))
      currentCell = ""

      if (!skipEmptyRows || currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow)
      }

      currentRow = []
      continue
    }

    currentCell += char
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(normalizeCell(currentCell, trimWhitespace))
    if (!skipEmptyRows || currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow)
    }
  }

  const maxColumns = rows.reduce((max, row) => Math.max(max, row.length), 0)
  return { rows, maxColumns }
}

function normalizeCell(value: string, trimWhitespace: boolean) {
  return trimWhitespace ? value.trim() : value
}

function mergeContinuationDescriptionRows(rows: string[][], hasHeaderRow: boolean) {
  if (rows.length === 0) {
    return rows
  }

  const headerRow = hasHeaderRow ? rows[0] : null
  const dataRows = hasHeaderRow ? rows.slice(1) : rows

  const descriptionColumnIndex = resolveDescriptionColumnIndex(headerRow)
  if (descriptionColumnIndex < 0) {
    return rows
  }

  const mergedDataRows: string[][] = []

  for (const row of dataRows) {
    const normalizedRow = [...row]

    if (
      mergedDataRows.length > 0 &&
      isDescriptionContinuationRow(normalizedRow, descriptionColumnIndex)
    ) {
      const previousRow = mergedDataRows[mergedDataRows.length - 1]
      const previousDescription = previousRow[descriptionColumnIndex] ?? ""
      const continuationDescription = normalizedRow[descriptionColumnIndex] ?? ""

      previousRow[descriptionColumnIndex] = joinDescriptionLines(
        previousDescription,
        continuationDescription,
      )

      continue
    }

    mergedDataRows.push(normalizedRow)
  }

  return headerRow ? [headerRow, ...mergedDataRows] : mergedDataRows
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "_")
}

function resolveDescriptionColumnIndex(headerRow: string[] | null) {
  if (!headerRow || headerRow.length === 0) {
    return 1
  }

  for (let index = 0; index < headerRow.length; index += 1) {
    const normalized = normalizeHeader(headerRow[index] ?? "")
    if (normalized.includes("description") || normalized.includes("particular")) {
      return index
    }
  }

  return 1
}

function isDescriptionContinuationRow(row: string[], descriptionColumnIndex: number) {
  let hasDescription = false

  for (let index = 0; index < row.length; index += 1) {
    const cell = row[index] ?? ""
    const normalizedCell = cell.trim()

    if (index === descriptionColumnIndex) {
      if (normalizedCell.length > 0 && normalizedCell !== "-") {
        hasDescription = true
      }
      continue
    }

    if (normalizedCell.length > 0 && normalizedCell !== "-") {
      return false
    }
  }

  return hasDescription
}

function joinDescriptionLines(currentValue: string, continuationValue: string) {
  const base = currentValue.trim()
  const continuation = continuationValue.trim()

  if (!base) {
    return continuation
  }

  if (!continuation) {
    return base
  }

  return `${base} ${continuation}`.replace(/\s+/g, " ").trim()
}

function escapeCsvCell(value: string) {
  if (value.includes('"') || value.includes(",") || value.includes("\n") || value.includes("\r")) {
    return `"${value.replace(/"/g, '""')}"`
  }

  return value
}

function inferImportField(header: string): ImportField {
  const normalized = normalizeHeader(header)

  if (normalized.includes("date")) {
    return "date"
  }

  if (normalized.includes("description") || normalized.includes("payee")) {
    return "description"
  }

  if (normalized.includes("amount")) {
    return "amount"
  }

  if (normalized.includes("negate") || normalized.includes("withdraw")) {
    return "amount_negate"
  }

  if (normalized.includes("account")) {
    return "account"
  }

  if (normalized.includes("reference") || normalized.includes("ref")) {
    return "reference"
  }

  if (normalized.includes("memo") || normalized.includes("note")) {
    return "memo"
  }

  return "unmapped"
}

function normalizeAccountName(value: string) {
  return value.trim().toLowerCase()
}

function resolveDestinationAccount(
  row: string[],
  accountColumnIndex: number,
  accountLookup: Map<string, Account>,
) {
  if (accountColumnIndex < 0) {
    return {
      destinationAccountId: null,
      destinationAccountError: null,
    }
  }

  const rawAccountName = row[accountColumnIndex]?.trim() ?? ""
  if (!rawAccountName) {
    return {
      destinationAccountId: null,
      destinationAccountError: null,
    }
  }

  const matchedAccount = accountLookup.get(normalizeAccountName(rawAccountName))

  if (!matchedAccount) {
    return {
      destinationAccountId: null,
      destinationAccountError: `No matching account for "${rawAccountName}"`,
    }
  }

  return {
    destinationAccountId: matchedAccount.id,
    destinationAccountError: null,
  }
}

function splitRowsEvenly<T>(items: T[], partCount: number) {
  const groups: T[][] = []
  const baseSize = Math.floor(items.length / partCount)
  const remainder = items.length % partCount
  let startIndex = 0

  for (let index = 0; index < partCount; index += 1) {
    const currentSize = baseSize + (index < remainder ? 1 : 0)
    groups.push(items.slice(startIndex, startIndex + currentSize))
    startIndex += currentSize
  }

  return groups
}

function buildSplitSessionTitleBase(fileName: string | null) {
  const normalized = (fileName ?? "").trim()

  if (!normalized) {
    return "ImportSession"
  }

  const extensionIndex = normalized.lastIndexOf(".")
  if (extensionIndex <= 0) {
    return normalized
  }

  return normalized.slice(0, extensionIndex)
}

type SourceAccountPickerProps = {
  accounts: Account[]
  selectedSourceAccountId: string
  onSelect: (accountId: string) => void
}

const SourceAccountPicker = memo(function SourceAccountPicker({
  accounts,
  selectedSourceAccountId,
  onSelect,
}: SourceAccountPickerProps) {
  return (
    <AccountSearchSelect
      accounts={accounts}
      value={selectedSourceAccountId || null}
      onValueChange={(value) => onSelect(value ?? "")}
      emptyLabel="Unassigned"
      allowEmpty
      className="w-full md:max-w-sm"
    />
  )
})

type SelectionToggleProps = {
  checked: boolean
  onToggle: () => void
  ariaLabel: string
}

function SelectionToggle({ checked, onToggle, ariaLabel }: SelectionToggleProps) {
  return (
    <Button
      type="button"
      variant={checked ? "default" : "outline"}
      size="icon-sm"
      className="size-7"
      onClick={onToggle}
      aria-label={ariaLabel}
    >
      <Check className={`size-4 ${checked ? "opacity-100" : "opacity-30"}`} />
    </Button>
  )
}

type ExpandableDescriptionCellProps = {
  value: string
  rowKey: string
  expandedRows: Set<string>
  onToggle: (rowKey: string) => void
}

function ExpandableDescriptionCell({
  value,
  rowKey,
  expandedRows,
  onToggle,
}: ExpandableDescriptionCellProps) {
  const isExpanded = expandedRows.has(rowKey)
  const isLong = value.length > 40

  if (!isLong) {
    return <div className="max-w-48 truncate">{value}</div>
  }

  return (
    <div className="max-w-48">
      <div className={isExpanded ? "whitespace-normal break-words" : "truncate"}>{value}</div>
      <button
        type="button"
        onClick={() => onToggle(rowKey)}
        className="mt-1 text-xs text-muted-foreground underline-offset-4 hover:underline"
      >
        {isExpanded ? "Show less" : "Show more"}
      </button>
    </div>
  )
}
