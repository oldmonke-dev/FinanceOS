export type NumberGroupingStyle = "international" | "indian"
export type FinancialYearMode = "indian" | "american" | "custom"

export type UserPreference = {
  userId: string
  numberGroupingStyle: NumberGroupingStyle
  financialYearMode: FinancialYearMode
  customFinancialYearStartDate: string | null
  updatedAt: string
}
