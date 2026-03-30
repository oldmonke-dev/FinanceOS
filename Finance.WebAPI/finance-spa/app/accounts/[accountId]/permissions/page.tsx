import { AccountPermissionsPage } from "@/components/account-permissions-page"

type AccountPermissionsRouteProps = {
  params: Promise<{
    accountId: string
  }>
}

export default async function AccountPermissionsRoute({
  params,
}: AccountPermissionsRouteProps) {
  const resolvedParams = await params

  return <AccountPermissionsPage accountId={resolvedParams.accountId} />
}
