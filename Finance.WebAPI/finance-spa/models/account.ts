export type AccountType = 1 | 2 | 3 | 4 | 5

export type Account = {
  id: string
  name: string
  accountNumber: string | null
  description: string | null
  accountType: AccountType | string
  parentAccountId: string | null
  openingBalance: number
  ownerUserId: string | null
  ownerDisplayName: string | null
  ownerEmail: string | null
}

export type CreateAccountInput = {
  id?: string
  name: string
  accountNumber?: string | null
  description?: string | null
  accountType: AccountType
  parentAccountId: string | null
  openingBalance: number
}

export type AccountNode = Account & {
  children: AccountNode[]
}
