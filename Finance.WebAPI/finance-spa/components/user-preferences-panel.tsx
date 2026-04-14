"use client"

import { useEffect, useState } from "react"

import { useSnackbar } from "@/components/providers/snackbar-provider"
import { useUserPreferences } from "@/components/providers/user-preferences-provider"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type FinancialYearMode, type NumberGroupingStyle } from "@/models/user-preference"

export function UserPreferencesPanel() {
  const { showSnackbar } = useSnackbar()
  const {
    preference,
    isLoading,
    errorMessage,
    updatePreferences,
  } = useUserPreferences()
  const [draftStyle, setDraftStyle] = useState<NumberGroupingStyle>("international")
  const [draftFinancialYearMode, setDraftFinancialYearMode] = useState<FinancialYearMode>("indian")
  const [draftCustomFinancialYearStartDate, setDraftCustomFinancialYearStartDate] = useState("2026-04-01")
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (preference) {
      setDraftStyle(preference.numberGroupingStyle)
      setDraftFinancialYearMode(preference.financialYearMode)
      setDraftCustomFinancialYearStartDate(
        preference.customFinancialYearStartDate?.slice(0, 10) ?? "2026-04-01",
      )
    }
  }, [preference])

  const previewLocale = draftStyle === "indian" ? "en-IN" : "en-US"
  const previewValue = new Intl.NumberFormat(previewLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(12345678.9)
  const financialYearPreview =
    draftFinancialYearMode === "indian"
      ? "Indian: FY starts on April 1 and AY follows in the next year."
      : draftFinancialYearMode === "american"
        ? "America (Preview): FY starts on January 1."
        : `Custom: FY starts on ${formatPreviewDate(draftCustomFinancialYearStartDate)}.`

  async function handleSave() {
    setIsSaving(true)

    try {
      await updatePreferences({
        numberGroupingStyle: draftStyle,
        financialYearMode: draftFinancialYearMode,
        customFinancialYearStartDate:
          draftFinancialYearMode === "custom" ? draftCustomFinancialYearStartDate : null,
      })
      showSnackbar({ message: "Preferences saved.", tone: "success" })
    } catch (error) {
      showSnackbar({
        message: error instanceof Error ? error.message : "Failed to save preferences.",
        tone: "error",
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="max-w-3xl rounded-2xl border bg-card p-6 shadow-sm">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Preferences</h2>
        <p className="text-sm text-muted-foreground">
          Choose how values are grouped and how financial years are interpreted in reports.
        </p>
      </div>

      <div className="mt-6 space-y-6">
        <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="number-grouping-style">
              Grouping system
            </label>
            <Select value={draftStyle} onValueChange={(value) => setDraftStyle(value as NumberGroupingStyle)}>
              <SelectTrigger id="number-grouping-style">
                <SelectValue placeholder="Select a number format" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="international">International 000,000</SelectItem>
                <SelectItem value="indian">Indian 00,000</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              International: 12,345,678.90. Indian: 1,23,45,678.90.
            </p>
          </div>

          <div className="rounded-2xl border bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Number Preview
            </p>
            <div className="mt-3 space-y-2">
              <p className="text-2xl font-semibold tabular-nums">{previewValue}</p>
              <p className="text-sm text-muted-foreground">
                Current saved style: {preference?.numberGroupingStyle ?? "loading"}
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr]">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="financial-year-mode">
              Financial year
            </label>
            <Select
              value={draftFinancialYearMode}
              onValueChange={(value) => setDraftFinancialYearMode(value as FinancialYearMode)}
            >
              <SelectTrigger id="financial-year-mode">
                <SelectValue placeholder="Select a financial year mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="indian">Indian</SelectItem>
                <SelectItem value="american">America (Preview)</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>

            {draftFinancialYearMode === "custom" ? (
              <label className="block space-y-2 pt-2">
                <span className="text-sm font-medium">Custom start date</span>
                <input
                  type="date"
                  value={draftCustomFinancialYearStartDate}
                  onChange={(event) => setDraftCustomFinancialYearStartDate(event.target.value)}
                  className="h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none transition focus:border-primary"
                />
              </label>
            ) : null}
          </div>

          <div className="rounded-2xl border bg-background/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Financial Year Preview
            </p>
            <div className="mt-3 space-y-2">
              <p className="text-lg font-semibold">{financialYearPreview}</p>
              <p className="text-sm text-muted-foreground">
                Current saved mode: {preference?.financialYearMode ?? "loading"}
              </p>
              {draftFinancialYearMode === "custom" ? (
                <p className="text-sm text-muted-foreground">
                  Saved custom date: {preference?.customFinancialYearStartDate?.slice(0, 10) ?? "not set"}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading preferences...</p> : null}
      {errorMessage ? <p className="mt-4 text-sm text-destructive">{errorMessage}</p> : null}

      <div className="mt-6 flex justify-end">
        <Button type="button" onClick={() => void handleSave()} disabled={isSaving || isLoading}>
          {isSaving ? "Saving..." : "Save preferences"}
        </Button>
      </div>
    </section>
  )
}

function formatPreviewDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}
