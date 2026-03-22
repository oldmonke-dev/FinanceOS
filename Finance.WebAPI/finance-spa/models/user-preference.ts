export type NumberGroupingStyle = "international" | "indian"

export type UserPreference = {
  userId: string
  numberGroupingStyle: NumberGroupingStyle
  updatedAt: string
}
