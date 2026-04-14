import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import path from "node:path"

import { AppShell } from "@/components/app-shell"

export default async function HelpPage() {
  const manualPath = resolveUserManualPath()
  const manual = await readFile(manualPath, "utf8")

  return (
    <AppShell
      title="Help"
      subtitle="Application manual and feature reference"
      badge="User manual"
    >
      <section className="mx-auto w-full rounded-3xl border bg-card p-4 shadow-sm xl:w-[72%]">
        <div className="mb-3">
          <h2 className="text-base font-semibold">User Manual</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            This page renders the contents of <code>USER_MANUAL.md</code>.
          </p>
        </div>
        <div className="rounded-2xl border bg-background/70 p-4">
          <MarkdownDocument content={manual} />
        </div>
      </section>
    </AppShell>
  )
}

function resolveUserManualPath() {
  const candidatePaths = [
    path.resolve(process.cwd(), "USER_MANUAL.md"),
    path.resolve(process.cwd(), "..", "USER_MANUAL.md"),
    path.resolve(process.cwd(), "..", "..", "USER_MANUAL.md"),
  ]

  const matchedPath = candidatePaths.find((candidatePath) => existsSync(candidatePath))

  if (!matchedPath) {
    throw new Error(
      `USER_MANUAL.md was not found. Checked: ${candidatePaths.join(", ")}`,
    )
  }

  return matchedPath
}

function MarkdownDocument({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, "\n").split("\n")
  const blocks: React.ReactNode[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()

    if (!trimmed) {
      index += 1
      continue
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = []
      index += 1

      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index])
        index += 1
      }

      blocks.push(
        <pre
          key={`code-${blocks.length}`}
          className="overflow-x-auto rounded-lg border bg-muted/40 px-3 py-2 text-xs whitespace-pre-wrap"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      )

      index += 1
      continue
    }

    if (trimmed.startsWith("# ")) {
      blocks.push(
        <h1 key={`h1-${blocks.length}`} className="text-xl font-semibold tracking-tight">
          {trimmed.slice(2)}
        </h1>,
      )
      index += 1
      continue
    }

    if (trimmed.startsWith("## ")) {
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="mt-3 text-lg font-semibold tracking-tight">
          {trimmed.slice(3)}
        </h2>,
      )
      index += 1
      continue
    }

    if (trimmed.startsWith("### ")) {
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="mt-2 text-sm font-semibold">
          {trimmed.slice(4)}
        </h3>,
      )
      index += 1
      continue
    }

    if (isMarkdownTableStart(lines, index)) {
      const header = splitTableRow(lines[index])
      const alignments = parseTableAlignments(lines[index + 1])
      const rows: string[][] = []

      index += 2

      while (index < lines.length) {
        const row = lines[index].trim()

        if (!row || !row.includes("|")) {
          break
        }

        rows.push(splitTableRow(lines[index]))
        index += 1
      }

      blocks.push(
        <div key={`table-${blocks.length}`} className="overflow-x-auto rounded-lg border">
          <table className="min-w-full border-collapse text-xs">
            <thead className="bg-muted/40">
              <tr>
                {header.map((cell, cellIndex) => (
                  <th
                    key={`th-${cellIndex}`}
                    className={`border-b px-2.5 py-1.5 font-semibold ${getTableAlignmentClass(alignments[cellIndex])}`}
                  >
                    {renderInlineMarkdown(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`} className="odd:bg-background even:bg-muted/10">
                  {header.map((_, cellIndex) => (
                    <td
                      key={`td-${rowIndex}-${cellIndex}`}
                      className={`border-t px-2.5 py-1.5 align-top ${getTableAlignmentClass(alignments[cellIndex])}`}
                    >
                      {renderInlineMarkdown(row[cellIndex] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    if (trimmed.startsWith("- ")) {
      const items: string[] = []

      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().slice(2))
        index += 1
      }

      blocks.push(
        <ul key={`ul-${blocks.length}`} className="ml-4 list-disc space-y-0.5 text-sm leading-5 text-foreground/90">
          {items.map((item, itemIndex) => (
            <li key={`${blocks.length}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      )
      continue
    }

    const paragraphLines: string[] = []

    while (
      index < lines.length &&
      lines[index].trim() &&
      !lines[index].trim().startsWith("#") &&
      !lines[index].trim().startsWith("- ") &&
      !lines[index].trim().startsWith("```")
    ) {
      paragraphLines.push(lines[index].trim())
      index += 1
    }

    blocks.push(
      <p key={`p-${blocks.length}`} className="text-sm leading-5 text-foreground/90">
        {renderInlineMarkdown(paragraphLines.join(" "))}
      </p>,
    )
  }

  return <article className="space-y-3">{blocks}</article>
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`)/g)

  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      )
    }

    return <span key={index}>{part}</span>
  })
}

function isMarkdownTableStart(lines: string[], index: number) {
  if (index + 1 >= lines.length) {
    return false
  }

  const header = lines[index].trim()
  const separator = lines[index + 1].trim()

  return header.includes("|") && isMarkdownTableSeparator(separator)
}

function isMarkdownTableSeparator(line: string) {
  const cells = splitTableRow(line)

  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()))
}

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())
}

function parseTableAlignments(separatorLine: string) {
  return splitTableRow(separatorLine).map((cell) => {
    const trimmed = cell.trim()

    if (trimmed.startsWith(":") && trimmed.endsWith(":")) {
      return "center"
    }

    if (trimmed.endsWith(":")) {
      return "right"
    }

    return "left"
  })
}

function getTableAlignmentClass(alignment?: string) {
  switch (alignment) {
    case "center":
      return "text-center"
    case "right":
      return "text-right"
    default:
      return "text-left"
  }
}
