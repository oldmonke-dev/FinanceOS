import { AccountLedgerPage } from "@/components/account-ledger-page"

type AccountLedgerRouteProps = {
  params: Promise<{
    accountId: string
  }>
}

export default async function AccountLedgerRoute({ params }: AccountLedgerRouteProps) {
  const resolvedParams = await params

  return <AccountLedgerPage accountId={resolvedParams.accountId} />
}
