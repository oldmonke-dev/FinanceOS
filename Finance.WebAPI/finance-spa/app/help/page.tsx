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
      <section className="rounded-3xl border bg-card p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">User Manual</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            This page renders the contents of <code>USER_MANUAL.md</code>.
          </p>
        </div>
        <div className="rounded-2xl border bg-background/70 p-5">
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
          className="overflow-x-auto rounded-xl border bg-muted/40 px-4 py-3 text-sm whitespace-pre-wrap"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      )

      index += 1
      continue
    }

    if (trimmed.startsWith("# ")) {
      blocks.push(
        <h1 key={`h1-${blocks.length}`} className="text-2xl font-semibold tracking-tight">
          {trimmed.slice(2)}
        </h1>,
      )
      index += 1
      continue
    }

    if (trimmed.startsWith("## ")) {
      blocks.push(
        <h2 key={`h2-${blocks.length}`} className="mt-4 text-xl font-semibold tracking-tight">
          {trimmed.slice(3)}
        </h2>,
      )
      index += 1
      continue
    }

    if (trimmed.startsWith("### ")) {
      blocks.push(
        <h3 key={`h3-${blocks.length}`} className="mt-3 text-base font-semibold">
          {trimmed.slice(4)}
        </h3>,
      )
      index += 1
      continue
    }

    if (trimmed.startsWith("- ")) {
      const items: string[] = []

      while (index < lines.length && lines[index].trim().startsWith("- ")) {
        items.push(lines[index].trim().slice(2))
        index += 1
      }

      blocks.push(
        <ul key={`ul-${blocks.length}`} className="ml-5 list-disc space-y-1 text-sm leading-6 text-foreground/90">
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
      <p key={`p-${blocks.length}`} className="text-sm leading-6 text-foreground/90">
        {renderInlineMarkdown(paragraphLines.join(" "))}
      </p>,
    )
  }

  return <article className="space-y-4">{blocks}</article>
}

function renderInlineMarkdown(text: string) {
  const parts = text.split(/(`[^`]+`)/g)

  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.9em]">
          {part.slice(1, -1)}
        </code>
      )
    }

    return <span key={index}>{part}</span>
  })
}
