import { createContext } from 'solid-js'

export const TabsContext = createContext<{
  id: string
  value: () => string
  select(value: string): void
}>()
