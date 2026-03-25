"use client"

import { useMemo, useState } from "react"

import { useAccounts } from "@/components/providers/accounts-provider"
import { useSnackbar } from "@/components/providers/snackbar-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { createAccount } from "@/lib/accounts"
import { importBayesianTrainingData } from "@/lib/strategies"
import {
  type BayesianTrainingExample,
} from "@/models/strategy"
import { type Account, type AccountType } from "@/models/account"

type ParsedCsv = {
  rows: string[][]
}

export function BayesianTrainingImportPanel() {
  const { accounts, addAccount, refreshAccounts } = useAccounts()
  const { showSnackbar } = useSnackbar()
  const [rawCsv, setRawCsv] = useState("")
  const [fileName, setFileName] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [isCreatingAccounts, setIsCreatingAccounts] = useState(false)

  const parsed = useMemo(() => parseCsv(rawCsv), [rawCsv])
  const examples = useMemo(() => buildTrainingExamples(parsed.rows), [parsed.rows])
  const missingAccountPaths = useMemo(
    () => getMissingAccountPaths(examples, accounts),
    [accounts, examples],
  )

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setFileName(file.name)
    setRawCsv(await file.text())
    showSnackbar({ message: `Loaded training CSV ${file.name}.`, tone: "success" })
  }

  async function handleImport() {
    if (missingAccountPaths.length > 0) {
      showSnackbar({
        message: "Some account paths from the training CSV do not exist yet.",
        tone: "error",
      })
      return
    }

    setIsImporting(true)
    showSnackbar({ message: "Importing Bayesian training data...", tone: "info" })

    try {
      const nextResult = await importBayesianTrainingData(examples)
      showSnackbar({
        message: `Imported ${nextResult.importedExampleCount} examples. Skipped ${nextResult.skippedExampleCount}.`,
        tone: "success",
        durationMs: 2600,
      })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to import Bayesian training data.",
        tone: "error",
      })
    } finally {
      setIsImporting(false)
    }
  }

  async function handleCreateMissingAccountsAndImport() {
    setIsCreatingAccounts(true)
    showSnackbar({ message: "Creating missing accounts...", tone: "info" })

    try {
      await createMissingAccounts(missingAccountPaths, accounts, addAccount)
      showSnackbar({ message: "Refreshing accounts...", tone: "info" })
      await refreshAccounts()

      showSnackbar({ message: "Importing Bayesian training data...", tone: "info" })
      const nextResult = await importBayesianTrainingData(examples)
      showSnackbar({
        message: `Imported ${nextResult.importedExampleCount} examples. Skipped ${nextResult.skippedExampleCount}.`,
        tone: "success",
        durationMs: 2600,
      })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to create missing accounts.",
        tone: "error",
      })
    } finally {
      setIsCreatingAccounts(false)
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-4 shadow-sm">
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">Import Training Data</h2>
        <p className="text-xs text-muted-foreground">
          Upload a GnuCash-style transaction CSV. Training examples are derived from paired rows
          that share the same transaction id.
        </p>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
        <Input type="file" accept=".csv,text/csv" onChange={(event) => void handleFileChange(event)} />
        <Button
          type="button"
          onClick={() => void handleImport()}
          disabled={isImporting || isCreatingAccounts || examples.length === 0}
        >
          {isImporting ? "Importing..." : "Import Training Data"}
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-xl border bg-background/70 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">File</p>
          <p className="mt-2 text-sm font-medium">{fileName ?? "No file selected"}</p>
        </div>
        <div className="rounded-xl border bg-background/70 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Parsed rows</p>
          <p className="mt-2 text-sm font-medium">{Math.max(parsed.rows.length - 1, 0)}</p>
        </div>
        <div className="rounded-xl border bg-background/70 p-3">
          <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Examples</p>
          <p className="mt-2 text-sm font-medium">{examples.length}</p>
        </div>
      </div>

      {missingAccountPaths.length > 0 ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">
            {missingAccountPaths.length} account path
            {missingAccountPaths.length === 1 ? "" : "s"} are not available.
          </p>
          <p className="mt-1 text-xs text-amber-800">
            Would you like to add them, then proceed with training import?
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleCreateMissingAccountsAndImport()}
              disabled={isCreatingAccounts || isImporting}
            >
              {isCreatingAccounts ? "Creating Accounts..." : "Add Missing Accounts and Import"}
            </Button>
          </div>
          <div className="mt-3 text-xs">
            Missing paths: {missingAccountPaths.slice(0, 10).join(", ")}
            {missingAccountPaths.length > 10 ? " ..." : ""}
          </div>
        </div>
      ) : null}

    </section>
  )
}

async function createMissingAccounts(
  missingAccountPaths: string[],
  existingAccounts: Account[],
  addAccount: (account: Account) => void,
) {
  const knownPathMap = buildAccountPathMap(existingAccounts)
  const sortedPaths = [...missingAccountPaths].sort(
    (left, right) => getPathSegments(left).length - getPathSegments(right).length,
  )

  for (const fullPath of sortedPaths) {
    const segments = getPathSegments(fullPath)
    let parentPath = ""
    let parentAccountId: string | null = null

    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      const currentPath = parentPath ? `${parentPath}/${segment.toLowerCase()}` : segment.toLowerCase()

      if (knownPathMap.has(currentPath)) {
        parentAccountId = knownPathMap.get(currentPath)?.id ?? null
        parentPath = currentPath
        continue
      }

      const createdAccount = await createAccount({
        name: segment,
        accountType: inferAccountTypeFromPath(segments),
        parentAccountId,
        openingBalance: 0,
      })

      addAccount(createdAccount)
      knownPathMap.set(currentPath, createdAccount)
      parentAccountId = createdAccount.id
      parentPath = currentPath
    }
  }
}

function getMissingAccountPaths(examples: BayesianTrainingExample[], accounts: Account[]) {
  const existingPathMap = buildAccountPathMap(accounts)
  const paths = new Set<string>()

  for (const example of examples) {
    if (example.sourceAccountPath) {
      paths.add(example.sourceAccountPath)
    }

    if (example.destinationAccountPath) {
      paths.add(example.destinationAccountPath)
    }
  }

  return Array.from(paths)
    .filter((path) => !existingPathMap.has(normalizeAccountPath(path)))
    .sort((left, right) => left.localeCompare(right))
}

function buildAccountPathMap(accounts: Account[]) {
  const accountById = new Map(accounts.map((account) => [account.id, account]))
  const pathMap = new Map<string, Account>()

  function buildPath(account: Account) {
    const segments: string[] = []
    let current: Account | undefined = account

    while (current) {
      segments.unshift(current.name)
      current =
        current.parentAccountId != null
          ? accountById.get(current.parentAccountId) ?? undefined
          : undefined
    }

    return normalizeAccountPath(segments.join(":"))
  }

  accounts.forEach((account) => {
    pathMap.set(buildPath(account), account)
  })

  return pathMap
}

function normalizeAccountPath(path: string) {
  return getPathSegments(path)
    .map((segment) => segment.toLowerCase())
    .join("/")
}

function getPathSegments(path: string) {
  return path
    .split(/[:/\\]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
}

function inferAccountTypeFromPath(segments: string[]): AccountType {
  const root = segments[0]?.trim().toLowerCase()

  if (root === "liabilities" || root === "liability") {
    return 2
  }

  if (root === "equity") {
    return 3
  }

  if (root === "income") {
    return 4
  }

  if (root === "expenses" || root === "expense") {
    return 5
  }

  return 1
}

function parseCsv(rawCsv: string): ParsedCsv {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentCell = ""
  let insideQuotes = false

  for (let index = 0; index < rawCsv.length; index += 1) {
    const char = rawCsv[index]
    const nextChar = rawCsv[index + 1]

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentCell += '"'
        index += 1
      } else {
        insideQuotes = !insideQuotes
      }

      continue
    }

    if (!insideQuotes && char === ",") {
      currentRow.push(currentCell.trim())
      currentCell = ""
      continue
    }

    if (!insideQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") {
        index += 1
      }

      currentRow.push(currentCell.trim())
      currentCell = ""

      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow)
      }

      currentRow = []
      continue
    }

    currentCell += char
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim())
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow)
    }
  }

  return { rows }
}

function buildTrainingExamples(rows: string[][]): BayesianTrainingExample[] {
  if (rows.length < 2) {
    return []
  }

  const headers = rows[0].map((value) => value.trim().toLowerCase())
  const transactionIdIndex = headers.indexOf("transaction id")
  const descriptionIndex = headers.indexOf("description")
  const memoIndex = headers.indexOf("memo")
  const notesIndex = headers.indexOf("notes")
  const fullAccountNameIndex = headers.indexOf("full account name")
  const amountIndex = headers.indexOf("amount num.")
  const numberIndex = headers.indexOf("number")

  if (transactionIdIndex < 0 || descriptionIndex < 0 || fullAccountNameIndex < 0) {
    return []
  }

  const groups = new Map<string, string[][]>()

  rows.slice(1).forEach((row) => {
    const transactionId = row[transactionIdIndex]?.trim()
    if (!transactionId) {
      return
    }

    const existing = groups.get(transactionId) ?? []
    existing.push(row)
    groups.set(transactionId, existing)
  })

  const examples: BayesianTrainingExample[] = []

  groups.forEach((groupRows) => {
    if (groupRows.length < 2) {
      return
    }

    for (const sourceRow of groupRows) {
      const sourceAccountPath = sourceRow[fullAccountNameIndex]?.trim() ?? ""
      const description = sourceRow[descriptionIndex]?.trim() || null
      const reference = numberIndex >= 0 ? sourceRow[numberIndex]?.trim() || null : null
      const memo =
        memoIndex >= 0
          ? sourceRow[memoIndex]?.trim() || null
          : notesIndex >= 0
            ? sourceRow[notesIndex]?.trim() || null
            : null
      const amount =
        amountIndex >= 0 && sourceRow[amountIndex]
          ? Number(sourceRow[amountIndex].replace(/,/g, ""))
          : null

      if (!sourceAccountPath) {
        continue
      }

      groupRows
        .filter((candidate) => candidate !== sourceRow)
        .forEach((destinationRow) => {
          const destinationAccountPath = destinationRow[fullAccountNameIndex]?.trim() ?? ""

          if (!destinationAccountPath) {
            return
          }

          examples.push({
            sourceAccountPath,
            destinationAccountPath,
            description,
            reference,
            memo,
            amount: Number.isFinite(amount) ? amount : null,
          })
        })
    }
  })

  return examples
}
