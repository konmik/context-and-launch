export interface PromptVariables {
  projectPath: string
  projectSlug: string
  skills: string
  launchDir: string
  ticketDir?: string
  ticketSlug?: string
  ticketTitle?: string
  ticketNumber?: string
  ticketStatus?: string
}

export function interpolatePrompt(text: string, variables: Record<string, string>): string {
  const values = new Map(Object.entries(variables))
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return values.get(key) ?? match
  })
}
