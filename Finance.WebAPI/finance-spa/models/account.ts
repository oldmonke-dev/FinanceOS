export type AccountType = 1 | 2 | 3 | 4 | 5

export type Account = {
  id: string
  name: string
  accountType: AccountType | string
  parentAccountId: string | null
  ownerUserId: string | null
  ownerDisplayName: string | null
  ownerEmail: string | null
}

export type CreateAccountInput = {
  id?: string
  name: string
  accountType: AccountType
  parentAccountId: string | null
}

export type AccountNode = Account & {
  children: AccountNode[]
}
