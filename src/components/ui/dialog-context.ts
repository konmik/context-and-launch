import { createContext } from 'solid-js'

export const DialogContext = createContext<{
  close(): void
  titleId: string
  descriptionId: string
}>()
