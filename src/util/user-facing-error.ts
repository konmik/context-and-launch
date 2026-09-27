export interface UserFacingError {
  readonly title: string
  readonly description: string
  readonly details?: string
  readonly field?: string
}
