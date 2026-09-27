import type { JSX } from '@solidjs/web'
import { DragPreview } from '../board/DragPreview.js'
import { DragGrip } from '../board/DragGrip.js'
import type { MergedSkill } from './launcher-settings-row-types.js'

export function LauncherSkillDropPreview(props: { skill: MergedSkill }): JSX.Element {
  return (
    <DragPreview class="flex items-center gap-2">
      <DragGrip testId="launcher-skill-drag-handle" />
      <span class="text-sm">{props.skill.name}</span>
    </DragPreview>
  )
}
