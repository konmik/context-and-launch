export interface PromptVariables {
  projectPath: string
  projectSlug: string
  skills: string
  launchDir: string
  taskDir?: string
  taskSlug?: string
  taskTitle?: string
  taskNumber?: string
  taskStatus?: string
}

export function interpolatePrompt(text: string, variables: Record<string, string>): string {
  const values = new Map(Object.entries(variables))
  return text.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    return values.get(key) ?? match
  })
}
