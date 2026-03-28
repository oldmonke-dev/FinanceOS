import { AccountTree } from "@/components/account-tree"
import { AppShell } from "@/components/app-shell"

export default function AccountsPage() {
  return (
    <AppShell
      title="Account tree"
      subtitle="Shared account state backed by the accounts API"
    >
      <div className="mx-auto w-full xl:max-w-[65%]">
        <AccountTree />
      </div>
    </AppShell>
  )
}
