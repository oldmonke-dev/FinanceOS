"use client"

import { useEffect, useState } from "react"

import { AppShell } from "@/components/app-shell"
import { useUserPreferences } from "@/components/providers/user-preferences-provider"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { type NumberGroupingStyle } from "@/models/user-preference"

export default function SettingsPage() {
  const {
    preference,
    isLoading,
    errorMessage,
    updateNumberGroupingStyle,
  } = useUserPreferences()
  const [draftStyle, setDraftStyle] = useState<NumberGroupingStyle>("international")
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  useEffect(() => {
    if (preference) {
      setDraftStyle(preference.numberGroupingStyle)
    }
  }, [preference])

  const previewLocale = draftStyle === "indian" ? "en-IN" : "en-US"
  const previewValue = new Intl.NumberFormat(previewLocale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(12345678.9)

  async function handleSave() {
    setIsSaving(true)
    setSaveMessage(null)

    try {
      await updateNumberGroupingStyle(draftStyle)
      setSaveMessage("Preferences saved.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <AppShell
      title="Settings"
      subtitle="Global preferences for formatting and presentation"
    >
      <section className="max-w-3xl rounded-2xl border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">Number format</h2>
          <p className="text-sm text-muted-foreground">
            Choose how values are grouped across balances, ledgers, and projections.
          </p>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr]">
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
              Preview
            </p>
            <div className="mt-3 space-y-2">
              <p className="text-2xl font-semibold tabular-nums">{previewValue}</p>
              <p className="text-sm text-muted-foreground">
                Current saved style: {preference?.numberGroupingStyle ?? "loading"}
              </p>
            </div>
          </div>
        </div>

        {isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading preferences...</p> : null}
        {errorMessage ? <p className="mt-4 text-sm text-destructive">{errorMessage}</p> : null}
        {saveMessage ? <p className="mt-4 text-sm text-emerald-600">{saveMessage}</p> : null}

        <div className="mt-6 flex justify-end">
          <Button type="button" onClick={() => void handleSave()} disabled={isSaving || isLoading}>
            {isSaving ? "Saving..." : "Save preferences"}
          </Button>
        </div>
      </section>
    </AppShell>
  )
}
