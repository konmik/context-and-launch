import type { LauncherItemType } from '~/core/launcher/launcher-config.js'

export type ItemType = LauncherItemType

export type Scope = 'app' | 'project'

export interface ItemFormState {
  mode: 'add' | 'edit'
  itemType: ItemType
  scope: Scope
  name: string
  text: string
  oldName?: string
}

export interface ColumnFormState {
  mode: 'add' | 'edit'
  name: string
  description: string
  color: string
  oldName?: string
}

export interface RenameFormState {
  oldName: string
  newName: string
  scope: 'all' | 'current' | 'none'
}

export interface DeleteTarget {
  type: 'board' | 'column'
  id: string
  name: string
}

export interface ItemFormDialogProps {
  form: ItemFormState | null | undefined
  onClose: () => void
}

export interface ColumnFormDialogProps {
  form: ColumnFormState | null | undefined
  boardId: string
  projectSlug: string
  onClose: () => void
}

export interface CreateBoardDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated: (boardId: string) => void
}
