export type User = {
  id: string
  email: string
  displayName: string
  isAdmin: boolean
  isSuperUser: boolean
  isActive: boolean
  createdAt: string
}

export type CreateUserInput = {
  email: string
  displayName: string
  password: string
  isAdmin: boolean
}
