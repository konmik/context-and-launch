import type { JSX } from '@solidjs/web'
import { createSignal, Show, useContext } from 'solid-js'
import { Group } from '~/components/ui/icons/Group.js'
import { EllipsisVertical } from '~/components/ui/icons/EllipsisVertical.js'
import { MenuContent } from '../ui/MenuContent.js'
import { MenuItem } from '../ui/MenuItem.js'
import { MenuRoot } from '../ui/MenuRoot.js'
import { MenuTrigger } from '../ui/MenuTrigger.js'
import { CARD_WIDTH } from './forest-graph.js'
import type { ForestNodeData } from './forest-flow-model.js'
import { ForestCardCommandsContext, ForestCardColumnsContext } from './forest-card-context.js'
import ForestConnectionHandle from './ForestConnectionHandle.js'
import StatusSwatch from '../task/StatusSwatch'
import HerdrStatusIcon from '../task/HerdrStatusIcon.js'
import { useHerdrStatuses } from '../task/herdr-statuses-context.js'

export default function ForestCard(props: { data: ForestNodeData; selected?: boolean }): JSX.Element {
  const commands = useContext(ForestCardCommandsContext)
  const columns = useContext(ForestCardColumnsContext)
  const herdrStatus = useHerdrStatuses()
  const [hovered, setHovered] = createSignal(false)
  const taskNumber = () => props.data.task.number
  return (
    <div
      class="relative min-h-[72px] select-none"
      style={{
        width: `${CARD_WIDTH}px`,
      }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      data-testid={props.data.group ? 'forest-group-card' : 'forest-task-card'}
      data-forest-card
      data-task-number={taskNumber()}
    >
      <div
        class={`forest-card-surface min-h-[72px] rounded-md bg-card/75 backdrop-blur-[2px] ${props.data.group ? 'border-2 border-dashed' : 'border'}${props.selected ? ' ring-2 ring-primary' : ''}`}
      >
        <div class="flex items-start gap-1 p-2">
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-1">
              <Show when={props.data.group}>
                <Group size={12} class="shrink-0 text-muted-foreground" />
              </Show>
              <span class="truncate text-sm font-medium text-primary">{taskNumber()}</span>
              <StatusSwatch status={props.data.task.status} columns={columns()} />
              <Show when={herdrStatus(props.data.task.folderName)}>{(s) => <HerdrStatusIcon status={s()} />}</Show>
            </div>
            <p class="line-clamp-2 text-sm">{props.data.task.title}</p>
          </div>
          <Show when={props.data.group}>
            <div
              class="contents nodrag nopan"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event: MouseEvent) => event.stopPropagation()}
            >
              <MenuRoot
                trigger={
                  <MenuTrigger class="btn-icon h-6 w-6 shrink-0" data-testid="forest-group-menu-trigger">
                    <EllipsisVertical size={14} />
                  </MenuTrigger>
                }
              >
                <MenuContent>
                  <MenuItem value="ungroup" onClick={() => commands.ungroup(taskNumber())} data-testid="forest-group-menu-ungroup">
                    Ungroup
                  </MenuItem>
                  <MenuItem
                    value="open-task"
                    onClick={() => commands.openGroupTask(taskNumber())}
                    data-testid="forest-group-menu-open-task"
                  >
                    Open group task
                  </MenuItem>
                </MenuContent>
              </MenuRoot>
            </div>
          </Show>
        </div>
      </div>
      <ForestConnectionHandle end="top" data={props.data} hovered={hovered()} />
      <ForestConnectionHandle end="bottom" data={props.data} hovered={hovered()} />
    </div>
  )
}
