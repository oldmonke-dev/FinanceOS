import { AppShell } from "@/components/app-shell"
import { UserPreferencesPanel } from "@/components/user-preferences-panel"

export default function UserPreferencesPage() {
  return (
    <AppShell
      title="User Preferences"
      subtitle="Formatting and financial-year settings for your account"
    >
      <UserPreferencesPanel />
    </AppShell>
  )
}
