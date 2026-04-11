"use client"

import Link from "next/link"
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react"
import {
  FileText,
  Settings2,
  Trash2,
  Upload,
  ZoomIn,
  ZoomOut,
} from "lucide-react"

import { AppShell } from "@/components/app-shell"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { detectPdfTables, uploadPdfImport } from "@/lib/pdf-imports"

const STORAGE_KEY = "finance.pdf-import.workspace.v1"
const PAGE_WIDTH = 760
const PAGE_HEIGHT = 980

type RegionSource = "auto" | "manual"

type PdfRegion = {
  id: string
  pageNumber: number
  x: number
  y: number
  width: number
  height: number
  label: string
  source: RegionSource
}

type CamelotConfig = {
  flavor: "lattice" | "stream"
  pagesMode: "current" | "all" | "custom"
  customPages: string
  lineScale: string
  edgeTolerance: string
  rowTolerance: string
  columnTolerance: string
  splitText: boolean
  stripText: boolean
}

type StoredWorkspace = {
  fileId: string | null
  fileName: string
  fileSize: number
  fileLastModified: number
  fileDataUrl: string
  pageCount: number
  supportsTextExtraction: boolean
  warningMessage: string | null
  selectedPage: number
  regions: PdfRegion[]
  camelotConfig: CamelotConfig
}

type DragState = {
  pageNumber: number
  startX: number
  startY: number
  currentX: number
  currentY: number
}

type ResizeHandle =
  | "move"
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"

type InteractionState = {
  regionId: string
  pageNumber: number
  handle: ResizeHandle
  pointerStartX: number
  pointerStartY: number
  initialRegion: PdfRegion
}

const defaultCamelotConfig: CamelotConfig = {
  flavor: "lattice",
  pagesMode: "current",
  customPages: "1",
  lineScale: "40",
  edgeTolerance: "50",
  rowTolerance: "2",
  columnTolerance: "0",
  splitText: true,
  stripText: true,
}

const resizeHandles: Array<{
  key: ResizeHandle
  cursor: string
  style: Record<string, string>
}> = [
  { key: "nw", cursor: "cursor-nwse-resize", style: { top: "-6px", left: "-6px" } },
  {
    key: "n",
    cursor: "cursor-ns-resize",
    style: { top: "-6px", left: "calc(50% - 6px)" },
  },
  { key: "ne", cursor: "cursor-nesw-resize", style: { top: "-6px", right: "-6px" } },
  {
    key: "e",
    cursor: "cursor-ew-resize",
    style: { top: "calc(50% - 6px)", right: "-6px" },
  },
  { key: "se", cursor: "cursor-nwse-resize", style: { right: "-6px", bottom: "-6px" } },
  {
    key: "s",
    cursor: "cursor-ns-resize",
    style: { bottom: "-6px", left: "calc(50% - 6px)" },
  },
  { key: "sw", cursor: "cursor-nesw-resize", style: { bottom: "-6px", left: "-6px" } },
  {
    key: "w",
    cursor: "cursor-ew-resize",
    style: { top: "calc(50% - 6px)", left: "-6px" },
  },
]

export default function PdfImportsPage() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const selectionSurfaceRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const [isHydrated, setIsHydrated] = useState(false)
  const [workspace, setWorkspace] = useState<StoredWorkspace | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [isLoadingFile, setIsLoadingFile] = useState(false)
  const [isDetectingTables, setIsDetectingTables] = useState(false)
  const [isConfigOpen, setIsConfigOpen] = useState(false)
  const [dragState, setDragState] = useState<DragState | null>(null)
  const [interactionState, setInteractionState] = useState<InteractionState | null>(null)
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null)
  const [zoomPercent, setZoomPercent] = useState(100)

  useEffect(() => {
    setIsHydrated(true)

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (!stored) {
        return
      }

      const parsed = JSON.parse(stored) as StoredWorkspace
      if (!parsed.fileDataUrl || !parsed.fileName) {
        return
      }

      setWorkspace({
        fileId: parsed.fileId ?? null,
        fileName: parsed.fileName,
        fileSize: parsed.fileSize,
        fileLastModified: parsed.fileLastModified,
        fileDataUrl: parsed.fileDataUrl,
        pageCount: parsed.pageCount,
        supportsTextExtraction: parsed.supportsTextExtraction ?? true,
        warningMessage: parsed.warningMessage ?? null,
        selectedPage: parsed.selectedPage,
        regions: parsed.regions,
        camelotConfig: parsed.camelotConfig,
      })
    } catch {
      window.localStorage.removeItem(STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    if (!isHydrated) {
      return
    }

    if (!workspace) {
      window.localStorage.removeItem(STORAGE_KEY)
      return
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
  }, [isHydrated, workspace])

  const zoomScale = zoomPercent / 100
  const pageNumbers = useMemo(
    () => (workspace ? Array.from({ length: workspace.pageCount }, (_, index) => index + 1) : []),
    [workspace],
  )
  const orderedRegions = useMemo(
    () =>
      [...(workspace?.regions ?? [])].sort((left, right) =>
        left.pageNumber === right.pageNumber
          ? left.y - right.y
          : left.pageNumber - right.pageNumber,
      ),
    [workspace],
  )

  const draftRegion = useMemo(() => {
    if (!dragState) {
      return null
    }

    const x = Math.min(dragState.startX, dragState.currentX)
    const y = Math.min(dragState.startY, dragState.currentY)
    const width = Math.abs(dragState.currentX - dragState.startX)
    const height = Math.abs(dragState.currentY - dragState.startY)

    if (width < 8 || height < 8) {
      return null
    }

    return { pageNumber: dragState.pageNumber, x, y, width, height }
  }, [dragState])

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) {
      return
    }

    setIsLoadingFile(true)
    setErrorMessage(null)

    try {
      const [fileDataUrl, uploadResult] = await Promise.all([
        readFileAsDataUrl(file),
        uploadPdfImport(file),
      ])

      setWorkspace({
        fileId: uploadResult.fileId,
        fileName: uploadResult.fileName || file.name,
        fileSize: uploadResult.fileSize || file.size,
        fileLastModified: file.lastModified,
        fileDataUrl,
        pageCount: Math.max(uploadResult.pageCount, 1),
        supportsTextExtraction: uploadResult.supportsTextExtraction,
        warningMessage: uploadResult.warningMessage,
        selectedPage: 1,
        regions: [],
        camelotConfig: {
          ...defaultCamelotConfig,
          customPages: uploadResult.pageCount > 1 ? "1-2" : "1",
        },
      })
      setSelectedRegionId(null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to upload PDF.")
    } finally {
      setIsLoadingFile(false)
    }
  }

  async function handleAutoDetect() {
    if (!workspace?.fileId) {
      return
    }

    setIsDetectingTables(true)
    setErrorMessage(null)

    try {
      const result = await detectPdfTables({
        fileId: workspace.fileId,
        flavor: workspace.camelotConfig.flavor,
        pages: resolveCamelotPages(workspace),
        lineScale: workspace.camelotConfig.lineScale,
        edgeTolerance: workspace.camelotConfig.edgeTolerance,
        rowTolerance: workspace.camelotConfig.rowTolerance,
        columnTolerance: workspace.camelotConfig.columnTolerance,
        splitText: workspace.camelotConfig.splitText,
        stripText: workspace.camelotConfig.stripText,
      })

      setWorkspace((current) => {
        if (!current) {
          return current
        }

        const manualRegions = current.regions.filter((region) => region.source !== "auto")
        return {
          ...current,
          pageCount: Math.max(result.pageCount, current.pageCount),
          supportsTextExtraction: result.supportsTextExtraction,
          warningMessage: result.warningMessage,
          regions: [...manualRegions, ...result.regions],
        }
      })

      setSelectedRegionId(result.regions[0]?.id ?? null)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to detect PDF tables.")
    } finally {
      setIsDetectingTables(false)
    }
  }

  function clearWorkspace() {
    setWorkspace(null)
    setErrorMessage(null)
    setDragState(null)
    setInteractionState(null)
    setSelectedRegionId(null)
    setIsConfigOpen(false)
    setZoomPercent(100)
  }

  function updateZoom(nextZoom: number) {
    setZoomPercent(clamp(nextZoom, 50, 200))
  }

  function handlePointerDown(pageNumber: number, event: React.PointerEvent<HTMLDivElement>) {
    if (!workspace) {
      return
    }

    const target = event.target as HTMLElement
    if (target.closest("[data-region-card='true']")) {
      return
    }

    const bounds = selectionSurfaceRefs.current[pageNumber]?.getBoundingClientRect()
    if (!bounds) {
      return
    }

    const x = ((event.clientX - bounds.left) / bounds.width) * PAGE_WIDTH
    const y = ((event.clientY - bounds.top) / bounds.height) * PAGE_HEIGHT

    setSelectedRegionId(null)
    setDragState({ pageNumber, startX: x, startY: y, currentX: x, currentY: y })
  }

  function handlePointerMove(pageNumber: number, event: React.PointerEvent<HTMLDivElement>) {
    if (interactionState) {
      if (interactionState.pageNumber != pageNumber) {
        return
      }

      const bounds = selectionSurfaceRefs.current[pageNumber]?.getBoundingClientRect()
      if (!bounds) {
        return
      }

      const x = ((event.clientX - bounds.left) / bounds.width) * PAGE_WIDTH
      const y = ((event.clientY - bounds.top) / bounds.height) * PAGE_HEIGHT

      setWorkspace((current) => {
        if (!current) {
          return current
        }

        return {
          ...current,
          regions: current.regions.map((region) =>
            region.id === interactionState.regionId
              ? applyRegionInteraction(
                  interactionState.initialRegion,
                  interactionState.handle,
                  x - interactionState.pointerStartX,
                  y - interactionState.pointerStartY,
                )
              : region,
          ),
        }
      })
      return
    }

    if (!dragState || dragState.pageNumber !== pageNumber) {
      return
    }

    const bounds = selectionSurfaceRefs.current[pageNumber]?.getBoundingClientRect()
    if (!bounds) {
      return
    }

    const x = ((event.clientX - bounds.left) / bounds.width) * PAGE_WIDTH
    const y = ((event.clientY - bounds.top) / bounds.height) * PAGE_HEIGHT

    setDragState((current) =>
      current
        ? {
            ...current,
            currentX: clamp(x, 0, PAGE_WIDTH),
            currentY: clamp(y, 0, PAGE_HEIGHT),
          }
        : current,
    )
  }

  function handlePointerUp(pageNumber: number) {
    if (interactionState) {
      if (interactionState.pageNumber !== pageNumber) {
        return
      }
      setInteractionState(null)
      return
    }

    const completedDrag = dragState
    if (!workspace || !dragRegionIsValid(completedDrag)) {
      setDragState(null)
      return
    }

    const finalDrag = completedDrag!
    if (finalDrag.pageNumber !== pageNumber) {
      setDragState(null)
      return
    }

    const x = Math.min(finalDrag.startX, finalDrag.currentX)
    const y = Math.min(finalDrag.startY, finalDrag.currentY)
    const width = Math.abs(finalDrag.currentX - finalDrag.startX)
    const height = Math.abs(finalDrag.currentY - finalDrag.startY)
    const pageRegionCount =
      workspace.regions.filter((region) => region.pageNumber === pageNumber).length + 1
    const nextRegion: PdfRegion = {
      id: createRegionId(),
      pageNumber,
      x,
      y,
      width,
      height,
      label: `Manual Area ${pageRegionCount}`,
      source: "manual",
    }

    setWorkspace({
      ...workspace,
      regions: [...workspace.regions, nextRegion],
    })
    setSelectedRegionId(nextRegion.id)
    setDragState(null)
  }

  function removeRegion(regionId: string, event?: React.PointerEvent | React.MouseEvent) {
    event?.stopPropagation()
    setWorkspace((current) =>
      current
        ? {
            ...current,
            regions: current.regions.filter((region) => region.id !== regionId),
          }
        : current,
    )
    setSelectedRegionId((current) => (current === regionId ? null : current))
  }

  function startRegionInteraction(
    region: PdfRegion,
    handle: ResizeHandle,
    event: React.PointerEvent,
  ) {
    event.stopPropagation()
    event.preventDefault()
    const bounds = selectionSurfaceRefs.current[region.pageNumber]?.getBoundingClientRect()
    if (!bounds) {
      return
    }

    const x = ((event.clientX - bounds.left) / bounds.width) * PAGE_WIDTH
    const y = ((event.clientY - bounds.top) / bounds.height) * PAGE_HEIGHT

    setSelectedRegionId(region.id)
    setInteractionState({
      regionId: region.id,
      pageNumber: region.pageNumber,
      handle,
      pointerStartX: x,
      pointerStartY: y,
      initialRegion: region,
    })
  }

  function updateCamelotConfig<K extends keyof CamelotConfig>(key: K, value: CamelotConfig[K]) {
    setWorkspace((current) =>
      current
        ? {
            ...current,
            camelotConfig: {
              ...current.camelotConfig,
              [key]: value,
            },
          }
        : current,
    )
  }

  const selectedRegion =
    workspace?.regions.find((region) => region.id === selectedRegionId) ?? null

  return (
    <AppShell
      title="PDF Imports"
      subtitle="Upload a PDF and mark extraction areas in a large table-selection workspace for a later Camelot flow"
      badge={
        workspace
          ? `${workspace.pageCount} page${workspace.pageCount === 1 ? "" : "s"}`
          : "No PDF loaded"
      }
    >
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_22rem]">
        <article className="min-w-0 rounded-3xl border bg-card p-4 shadow-sm md:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-4">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <FileText className="size-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">PDF workspace</h2>
                <p className="text-sm text-muted-foreground">
                  The uploaded file and selected regions are kept in local storage on this browser.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="sr-only"
                onChange={(event) => void handleFileChange(event)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoadingFile}
              >
                <Upload className="size-4" />
                {isLoadingFile ? "Loading PDF..." : workspace ? "Replace PDF" : "Upload PDF"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleAutoDetect()}
                disabled={!workspace?.fileId || isDetectingTables || !workspace.supportsTextExtraction}
              >
                {isDetectingTables ? "Detecting..." : "Auto Detect"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsConfigOpen(true)}
                disabled={!workspace}
              >
                <Settings2 className="size-4" />
                Camelot Config
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={clearWorkspace}
                disabled={!workspace}
              >
                <Trash2 className="size-4" />
                Clear
              </Button>
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-4 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              {errorMessage}
            </div>
          ) : null}

          {workspace ? (
            <>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <div className="rounded-full border bg-background px-3 py-1 text-sm text-muted-foreground">
                  Table Selection Workspace
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => updateZoom(zoomPercent - 10)}
                    disabled={!workspace}
                  >
                    <ZoomOut className="size-4" />
                  </Button>
                  <span className="rounded-full border bg-background px-3 py-1">
                    {zoomPercent}%
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    onClick={() => updateZoom(zoomPercent + 10)}
                    disabled={!workspace}
                  >
                    <ZoomIn className="size-4" />
                  </Button>
                  <span className="rounded-full border bg-background px-3 py-1">
                    {workspace.pageCount} page{workspace.pageCount === 1 ? "" : "s"}
                  </span>
                </div>
              </div>

              <div className="mt-4 overflow-hidden rounded-3xl border bg-muted/20">
                <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_18rem]">
                  <div className="min-w-0">
                    <div className="max-h-[78vh] space-y-6 overflow-auto rounded-[2rem] p-2">
                      {pageNumbers.map((pageNumber) => {
                        const pageRegions = workspace.regions.filter(
                          (region) => region.pageNumber === pageNumber,
                        )

                        return (
                          <div
                            key={`page-${pageNumber}`}
                            ref={(element) => {
                              selectionSurfaceRefs.current[pageNumber] = element
                            }}
                            className="relative mx-auto overflow-hidden rounded-[2rem] border bg-white shadow-[0_24px_80px_rgba(15,23,42,0.16)]"
                            style={{
                              width: `${PAGE_WIDTH * zoomScale}px`,
                              height: `${PAGE_HEIGHT * zoomScale}px`,
                            }}
                            onPointerDown={(event) => handlePointerDown(pageNumber, event)}
                            onPointerMove={(event) => handlePointerMove(pageNumber, event)}
                            onPointerUp={() => handlePointerUp(pageNumber)}
                            onPointerLeave={() => {
                              if (interactionState?.pageNumber === pageNumber) {
                                setInteractionState(null)
                              } else if (dragState?.pageNumber === pageNumber) {
                                handlePointerUp(pageNumber)
                              }
                            }}
                          >
                            <div className="absolute inset-0 bg-white">
                              <object
                                key={`${workspace.fileId ?? workspace.fileName}-${pageNumber}`}
                                data={`${workspace.fileDataUrl}#page=${pageNumber}&toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
                                type="application/pdf"
                                className="h-full w-full pointer-events-none"
                                aria-label={`PDF background page ${pageNumber}`}
                              >
                                <div className="flex h-full items-center justify-center bg-slate-100 text-sm text-slate-500">
                                  PDF background preview is not available in this browser.
                                </div>
                              </object>
                            </div>

                            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.07)_1px,transparent_1px)] bg-[size:3.2rem_3.2rem]" />

                            <div className="absolute right-6 bottom-6 rounded-2xl border bg-white/92 px-3 py-2 text-sm text-slate-600 shadow-sm">
                              Page {pageNumber}
                            </div>

                            {pageRegions.map((region) => (
                              <div
                                key={region.id}
                                data-region-card="true"
                                onClick={() => setSelectedRegionId(region.id)}
                                className={`absolute rounded-2xl border-2 text-left shadow-sm transition ${
                                  selectedRegionId === region.id
                                    ? "border-primary bg-primary/15"
                                    : region.source === "auto"
                                      ? "border-emerald-400 bg-emerald-200/20"
                                      : "border-sky-400 bg-sky-200/20"
                                }`}
                                style={toRegionStyle(region)}
                              >
                                <button
                                  type="button"
                                  className="absolute inset-0 cursor-move rounded-[inherit]"
                                  onPointerDown={(event) => startRegionInteraction(region, "move", event)}
                                  aria-label={`Move ${region.label}`}
                                />
                                <span className="pointer-events-none absolute top-2 left-2 rounded-full border bg-white/90 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                                  {region.label}
                                </span>
                                {selectedRegionId === region.id ? (
                                  <>
                                    <button
                                      type="button"
                                      className="absolute top-2 right-2 z-10 rounded-full border bg-white/95 px-2 py-1 text-[11px] font-medium text-red-600 shadow-sm hover:bg-red-50"
                                      onPointerDown={(event) => removeRegion(region.id, event)}
                                      aria-label={`Delete ${region.label}`}
                                    >
                                      Delete
                                    </button>
                                    {resizeHandles.map((handle) => (
                                      <button
                                        key={`${region.id}-${handle.key}`}
                                        type="button"
                                        className={`absolute z-10 size-3 rounded-full border-2 border-white bg-primary shadow-sm ${handle.cursor}`}
                                        style={handle.style}
                                        onPointerDown={(event) =>
                                          startRegionInteraction(region, handle.key, event)
                                        }
                                        aria-label={`${handle.key} resize handle`}
                                      />
                                    ))}
                                  </>
                                ) : null}
                              </div>
                            ))}

                            {draftRegion?.pageNumber === pageNumber ? (
                              <div
                                className="absolute rounded-2xl border-2 border-dashed border-primary bg-primary/10"
                                style={toRegionStyle(draftRegion)}
                              />
                            ) : null}
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="rounded-2xl border bg-background p-4">
                      <p className="text-sm font-medium">Region controls</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Drag on the PDF to create a manual area, or select an existing region to inspect it.
                      </p>
                    </div>

                    {selectedRegion ? (
                      <div className="rounded-2xl border bg-background p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium">{selectedRegion.label}</p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {selectedRegion.source === "auto" ? "Mock auto-detected table" : "Manual capture area"}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeRegion(selectedRegion.id)}
                            aria-label="Delete selected table"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>

                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <div className="rounded-xl border bg-muted/30 px-3 py-2">
                            X: {Math.round(selectedRegion.x)}
                          </div>
                          <div className="rounded-xl border bg-muted/30 px-3 py-2">
                            Y: {Math.round(selectedRegion.y)}
                          </div>
                          <div className="rounded-xl border bg-muted/30 px-3 py-2">
                            W: {Math.round(selectedRegion.width)}
                          </div>
                          <div className="rounded-xl border bg-muted/30 px-3 py-2">
                            H: {Math.round(selectedRegion.height)}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed bg-background p-4 text-sm text-muted-foreground">
                        No region selected.
                      </div>
                    )}

                    <div className="rounded-2xl border bg-background p-4">
                      <p className="text-sm font-medium">Detected and manual regions</p>
                      <div className="mt-3 space-y-2">
                        {orderedRegions.length > 0 ? (
                          orderedRegions.map((region) => (
                            <button
                              key={`list-${region.id}`}
                              type="button"
                              onClick={() => setSelectedRegionId(region.id)}
                              className={`flex w-full items-center justify-between rounded-xl border px-3 py-2 text-left text-sm transition ${
                                selectedRegionId === region.id
                                  ? "border-primary bg-primary/5"
                                  : "hover:bg-muted/40"
                              }`}
                            >
                              <span>{region.label}</span>
                              <span className="text-xs text-muted-foreground">
                                p{region.pageNumber} · {region.source}
                              </span>
                            </button>
                          ))
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            No regions saved yet.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="mt-5 rounded-3xl border border-dashed bg-muted/15 p-10 text-center">
              <p className="text-base font-medium">No PDF loaded</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Upload a PDF to open the preview workspace and start defining capture areas.
              </p>
              <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
                <Button type="button" onClick={() => fileInputRef.current?.click()}>
                  <Upload className="size-4" />
                  Upload PDF
                </Button>
                <Button asChild type="button" variant="outline">
                  <Link href="/import">Open CSV Imports</Link>
                </Button>
              </div>
            </div>
          )}
        </article>

        <aside className="space-y-4">
          <article className="rounded-3xl border bg-card p-5 shadow-sm">
            <h3 className="text-base font-semibold">Workspace state</h3>
            <div className="mt-4 space-y-3 text-sm text-muted-foreground">
              <div className="rounded-2xl border bg-background/70 px-4 py-3">
                File:
                <span className="ml-1 font-medium text-foreground">
                  {workspace ? workspace.fileName : "None"}
                </span>
              </div>
              <div className="rounded-2xl border bg-background/70 px-4 py-3">
                Persistence:
                <span className="ml-1 font-medium text-foreground">Local storage</span>
              </div>
              <div className="rounded-2xl border bg-background/70 px-4 py-3">
                Regions:
                <span className="ml-1 font-medium text-foreground">
                  {workspace ? workspace.regions.length : 0}
                </span>
              </div>
              {workspace?.warningMessage ? (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-800">
                  {workspace.warningMessage}
                </div>
              ) : null}
            </div>
          </article>

          <article className="rounded-3xl border bg-card p-5 shadow-sm">
            <h3 className="text-base font-semibold">Next integration point</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Camelot is not wired yet. This page currently stores the PDF, page selection,
              drag regions, and config values so the extraction step can be added later.
            </p>
          </article>
        </aside>
      </section>

      <Sheet open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Camelot Config Playground</SheetTitle>
            <SheetDescription>
              These controls are stored now so the real Camelot backend can use them later.
            </SheetDescription>
          </SheetHeader>

          {workspace ? (
            <div className="grid gap-4 px-4 pb-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Flavor</span>
                  <select
                    value={workspace.camelotConfig.flavor}
                    onChange={(event) =>
                      updateCamelotConfig(
                        "flavor",
                        event.target.value as CamelotConfig["flavor"],
                      )
                    }
                    className="h-10 w-full rounded-xl border bg-background px-3"
                  >
                    <option value="lattice">lattice</option>
                    <option value="stream">stream</option>
                  </select>
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium">Pages Mode</span>
                  <select
                    value={workspace.camelotConfig.pagesMode}
                    onChange={(event) =>
                      updateCamelotConfig(
                        "pagesMode",
                        event.target.value as CamelotConfig["pagesMode"],
                      )
                    }
                    className="h-10 w-full rounded-xl border bg-background px-3"
                  >
                    <option value="all">all pages</option>
                    <option value="custom">custom</option>
                  </select>
                </label>
              </div>

              <label className="space-y-2 text-sm">
                <span className="font-medium">Custom pages</span>
                <Input
                  value={workspace.camelotConfig.customPages}
                  onChange={(event) => updateCamelotConfig("customPages", event.target.value)}
                  placeholder="1,3,5-7"
                />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2 text-sm">
                  <span className="font-medium">Line scale</span>
                  <Input
                    value={workspace.camelotConfig.lineScale}
                    onChange={(event) => updateCamelotConfig("lineScale", event.target.value)}
                  />
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium">Edge tolerance</span>
                  <Input
                    value={workspace.camelotConfig.edgeTolerance}
                    onChange={(event) =>
                      updateCamelotConfig("edgeTolerance", event.target.value)
                    }
                  />
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium">Row tolerance</span>
                  <Input
                    value={workspace.camelotConfig.rowTolerance}
                    onChange={(event) =>
                      updateCamelotConfig("rowTolerance", event.target.value)
                    }
                  />
                </label>

                <label className="space-y-2 text-sm">
                  <span className="font-medium">Column tolerance</span>
                  <Input
                    value={workspace.camelotConfig.columnTolerance}
                    onChange={(event) =>
                      updateCamelotConfig("columnTolerance", event.target.value)
                    }
                  />
                </label>
              </div>

              <label className="flex items-center justify-between rounded-2xl border bg-background px-4 py-3 text-sm">
                <span>Split text</span>
                <input
                  type="checkbox"
                  checked={workspace.camelotConfig.splitText}
                  onChange={(event) => updateCamelotConfig("splitText", event.target.checked)}
                />
              </label>

              <label className="flex items-center justify-between rounded-2xl border bg-background px-4 py-3 text-sm">
                <span>Strip text</span>
                <input
                  type="checkbox"
                  checked={workspace.camelotConfig.stripText}
                  onChange={(event) => updateCamelotConfig("stripText", event.target.checked)}
                />
              </label>
            </div>
          ) : (
            <div className="px-4 pb-4 text-sm text-muted-foreground">
              Upload a PDF first to start editing config values.
            </div>
          )}

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setIsConfigOpen(false)}>
              Close
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </AppShell>
  )
}

function resolveCamelotPages(workspace: StoredWorkspace) {
  if (workspace.camelotConfig.pagesMode === "custom") {
    return workspace.camelotConfig.customPages.trim() || "all"
  }

  return "all"
}

function toRegionStyle(region: { x: number; y: number; width: number; height: number }) {
  return {
    left: `${(region.x / PAGE_WIDTH) * 100}%`,
    top: `${(region.y / PAGE_HEIGHT) * 100}%`,
    width: `${(region.width / PAGE_WIDTH) * 100}%`,
    height: `${(region.height / PAGE_HEIGHT) * 100}%`,
  }
}

function createRegionId() {
  return `region_${Math.random().toString(36).slice(2, 10)}`
}

function applyRegionInteraction(
  initialRegion: PdfRegion,
  handle: ResizeHandle,
  deltaX: number,
  deltaY: number,
) {
  const minSize = 24
  let nextLeft = initialRegion.x
  let nextTop = initialRegion.y
  let nextRight = initialRegion.x + initialRegion.width
  let nextBottom = initialRegion.y + initialRegion.height

  if (handle === "move") {
    nextLeft = clamp(initialRegion.x + deltaX, 0, PAGE_WIDTH - initialRegion.width)
    nextTop = clamp(initialRegion.y + deltaY, 0, PAGE_HEIGHT - initialRegion.height)

    return {
      ...initialRegion,
      x: nextLeft,
      y: nextTop,
    }
  }

  if (handle.includes("w")) {
    nextLeft = clamp(initialRegion.x + deltaX, 0, nextRight - minSize)
  }

  if (handle.includes("e")) {
    nextRight = clamp(
      initialRegion.x + initialRegion.width + deltaX,
      nextLeft + minSize,
      PAGE_WIDTH,
    )
  }

  if (handle.includes("n")) {
    nextTop = clamp(initialRegion.y + deltaY, 0, nextBottom - minSize)
  }

  if (handle.includes("s")) {
    nextBottom = clamp(
      initialRegion.y + initialRegion.height + deltaY,
      nextTop + minSize,
      PAGE_HEIGHT,
    )
  }

  return {
    ...initialRegion,
    x: nextLeft,
    y: nextTop,
    width: nextRight - nextLeft,
    height: nextBottom - nextTop,
  }
}

function dragRegionIsValid(dragState: DragState | null) {
  if (!dragState) {
    return false
  }

  return (
    Math.abs(dragState.currentX - dragState.startX) >= 8 &&
    Math.abs(dragState.currentY - dragState.startY) >= 8
  )
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."))
    reader.readAsDataURL(file)
  })
}
