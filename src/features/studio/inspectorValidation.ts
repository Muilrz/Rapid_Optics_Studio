import { ZodError } from 'zod'

export const parseFiniteNumericDraft = (draft: string): number => {
  if (draft.trim() === '') {
    throw new RangeError('Enter a number before committing this field.')
  }
  const value = Number(draft)
  if (!Number.isFinite(value)) {
    throw new RangeError('Value must be a finite number.')
  }
  return value
}

export const formatInspectorError = (error: unknown): string => {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? 'Value does not satisfy the schema.'
  }
  if (error instanceof Error) return error.message
  return 'Unable to commit this value.'
}
