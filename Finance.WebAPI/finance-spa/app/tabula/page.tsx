"use client"

import { useRef, useState } from "react"
import { Download, FileSpreadsheet, LoaderCircle } from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { extractPdfImport } from "@/lib/import-extraction"

type MessageState = {
  tone: "success" | "error"
  text: string
}

export default function TabulaPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [password, setPassword] = useState("")
  const [csvText, setCsvText] = useState("")
  const [isExtracting, setIsExtracting] = useState(false)
  const [message, setMessage] = useState<MessageState | null>(null)

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsExtracting(true)
    setMessage(null)

    try {
      const result = await extractPdfImport(file, password || null)
      setFileName(result.fileName)
      setCsvText(result.csvText)
      setMessage({
        tone: "success",
        text: result.message,
      })
    } catch (error) {
      setMessage({
        tone: "error",
        text: error instanceof Error ? error.message : "Failed to extract PDF to CSV.",
      })
    } finally {
      setIsExtracting(false)
      event.target.value = ""
    }
  }

  async function copyCsv() {
    if (!csvText) {
      return
    }

    await navigator.clipboard.writeText(csvText)
    setMessage({
      tone: "success",
      text: "CSV copied to clipboard.",
    })
  }

  function downloadCsv() {
    if (!csvText) {
      return
    }

    const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    const baseName = fileName ? fileName.replace(/\.pdf$/i, "") : "tabula-output"
    anchor.href = url
    anchor.download = `${baseName}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AppShell
      title="Tabula"
      subtitle="PDF in, CSV out. This page only extracts tabular text with Tabula."
      badge={isExtracting ? "Extracting" : csvText ? "CSV ready" : "Idle"}
    >
      <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <article className="rounded-3xl border bg-card p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-primary/10 p-3 text-primary">
              <FileSpreadsheet className="size-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Extract PDF</h2>
              <p className="text-sm text-muted-foreground">
                Upload a PDF and get raw CSV output from the Tabula backend endpoint.
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-4">
            <label className="block space-y-2 text-sm">
              <span className="font-medium">PDF password</span>
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Optional"
              />
            </label>

            <div className="space-y-2 text-sm">
              <span className="font-medium">PDF file</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                onChange={handleFileChange}
                className="sr-only"
              />
              <Button
                type="button"
                variant="outline"
                className="h-10 w-full justify-start"
                onClick={() => fileInputRef.current?.click()}
                disabled={isExtracting}
              >
                {isExtracting ? (
                  <>
                    <LoaderCircle className="size-4 animate-spin" />
                    Extracting PDF with Tabula...
                  </>
                ) : (
                  "Choose PDF file"
                )}
              </Button>
            </div>

            <div className="rounded-2xl border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
              {fileName ? `Last extracted file: ${fileName}` : "No PDF extracted yet."}
            </div>

            {message ? (
              <div
                className={`rounded-2xl border px-4 py-3 text-sm ${
                  message.tone === "success"
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
                }`}
              >
                {message.text}
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => void copyCsv()} disabled={!csvText}>
                Copy CSV
              </Button>
              <Button type="button" onClick={downloadCsv} disabled={!csvText}>
                <Download className="size-4" />
                Download CSV
              </Button>
            </div>
          </div>
        </article>

        <article className="rounded-3xl border bg-card p-6 shadow-sm">
          <div>
            <h2 className="text-lg font-semibold">CSV Output</h2>
            <p className="text-sm text-muted-foreground">
              Raw Tabula output. Review and clean it before using it in the importer.
            </p>
          </div>

          <textarea
            value={csvText}
            onChange={(event) => setCsvText(event.target.value)}
            className="mt-5 min-h-[32rem] w-full rounded-2xl border border-input bg-background/70 px-3 py-3 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            spellCheck={false}
            placeholder="CSV output will appear here after PDF extraction."
          />
        </article>
      </section>
    </AppShell>
  )
}
