import type { JSX } from '@solidjs/web'
import { createSignal, createEffect, createMemo, useContext, Show, For } from 'solid-js'
import { DragDropProvider } from '~/components/drag/DragDropProvider.js'
import { NameDragOverlay } from '../board/NameDragOverlay.js'
import { ItemDropPreview } from './ItemDropPreview.js'
import { SortableItemRow } from './SortableItemRow.js'
import type { MergedLauncherItem } from './launcher-settings-row-types.js'
import { ItemFormDialog } from './ItemFormDialog.js'
import { useErrorReporter } from '../shared/error-presentation.js'
import { errorPayload } from '~/core/shared/errors.js'
import { createListReorder, midpointOrder } from '../board/list-reorder.js'
import type { ItemType, Scope, ItemFormState } from './launcher-settings-form-types.js'
import { LauncherConfigContext } from './shared-launcher-config-storage.js'
import { mergeLauncherConfigs, updateLauncherReferences } from '~/core/launcher/launcher-config-data.js'
import { ProjectLauncherConfigContext } from './project-launcher-config-storage.js'
import { itemCollections } from './launcher-settings-pure.js'
import type { ItemSectionProps } from './ItemSection.js'

export function ItemSectionContent(props: ItemSectionProps): JSX.Element {
  const sharedConfig = useContext(LauncherConfigContext)!
  const projectConfig = useContext(ProjectLauncherConfigContext)!
  const config = createMemo(() => mergeLauncherConfigs(sharedConfig.get(), projectConfig.get()))
  const errors = useErrorReporter()
  const [form, setForm] = createSignal<ItemFormState | null>(null)
  const items = () => config()[itemCollections[props.itemType]]
  const detailOf = (item: MergedLauncherItem) => ('text' in item ? item.text : item.command)
  createEffect(
    () => props.open,
    (open) => {
      if (!open) return
      setForm(null)
      errors.clear()
    },
  )

  function startAdd(itemType: ItemType) {
    setForm({
      mode: 'add',
      itemType,
      scope: 'app',
      name: '',
      text: '',
    })
  }

  function startEdit(itemType: ItemType, scope: Scope, name: string, text: string) {
    setForm({
      mode: 'edit',
      itemType,
      scope,
      name,
      text,
      oldName: name,
    })
  }

  async function deleteItemFn(itemType: ItemType, scope: Scope, name: string) {
    errors.clear()
    try {
      const result = await (scope === 'app' ? sharedConfig : projectConfig).update((current) => ({
        ...current,
        [itemCollections[itemType]]: (current[itemCollections[itemType]] ?? []).filter((item) => item.name !== name),
        columnDefaults: updateLauncherReferences(current.columnDefaults, itemType, name, null),
      }))
      if (result.type === 'Failure')
        errors.report(result.error)
    } catch (e) {
      errors.report(errorPayload(e, 'Delete failed'))
    }
  }

  const reorder = createListReorder<MergedLauncherItem>({
    items,
    idOf: (item) => item.name,
    onReorder: (orderedNames, dragged) => {
      const orderOf = (name: string) => items().find((item) => item.name === name)?.order
      const newIndex = orderedNames.indexOf(dragged.name)
      const before = newIndex > 0 ? orderOf(orderedNames[newIndex - 1]) : undefined
      const after = newIndex < orderedNames.length - 1 ? orderOf(orderedNames[newIndex + 1]) : undefined
      const newOrder = midpointOrder(before, after)
      saveItemOrder(dragged.scope, dragged.name, newOrder)
    },
  })

  async function saveItemOrder(scope: Scope, name: string, order: number) {
    errors.clear()
    try {
      const result = await (scope === 'app' ? sharedConfig : projectConfig).update((current) => ({
        ...current,
        [itemCollections[props.itemType]]: (current[itemCollections[props.itemType]] ?? []).map((item) =>
          item.name === name
            ? {
                ...item,
                order,
              }
            : item,
        ),
      }))
      if (result.type === 'Failure')
        errors.report(result.error)
    } catch (e) {
      errors.report(errorPayload(e, 'Reorder failed'))
    }
  }

  return (
    <>
      <section>
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-sm font-semibold">{props.heading}</h3>
          <button onClick={() => startAdd(props.itemType)} class="btn-primary btn-sm" data-testid={props.addButtonTestId}>
            Add
          </button>
        </div>
        <Show
          when={items().length > 0}
          fallback={<p class="py-3 text-center text-sm text-muted-foreground">No {props.heading.toLowerCase()} configured.</p>}
        >
          <DragDropProvider onDragStart={reorder.onDragStart} onDragOver={reorder.onDragOver} onDragEnd={reorder.onDragEnd}>
            <div class="space-y-2">
              <For each={items()}>
                {(item, index) => (
                  <>
                    <Show when={reorder.dropPreview()?.insertBefore === index()}>
                      <ItemDropPreview item={reorder.dropPreview()!.item} detail={detailOf(reorder.dropPreview()!.item)} />
                    </Show>
                    <SortableItemRow
                      item={item}
                      detail={detailOf(item)}
                      isActive={reorder.activeId() === item.name}
                      onEdit={() => startEdit(props.itemType, item.scope, item.name, detailOf(item))}
                      onDelete={() => deleteItemFn(props.itemType, item.scope, item.name)}
                      rowTestId={props.rowTestId}
                      dragHandleTestId={props.dragHandleTestId}
                      editTestId={props.editTestId}
                      deleteTestId={props.deleteTestId}
                    />
                  </>
                )}
              </For>
              <Show when={reorder.dropPreview()?.insertBefore === items().length}>
                <ItemDropPreview item={reorder.dropPreview()!.item} detail={detailOf(reorder.dropPreview()!.item)} />
              </Show>
            </div>
            <NameDragOverlay nameOf={(id) => items().find((item) => item.name === id)?.name} />
          </DragDropProvider>
        </Show>
        <Show when={props.sharedOrderWarning && items().some((item) => item.scope === 'app')}>
          <p class="mt-2 text-xs text-muted-foreground" data-testid={props.sharedOrderWarningTestId}>
            {props.sharedOrderWarning}
          </p>
        </Show>
      </section>
      <ItemFormDialog form={props.open ? form() : undefined} onClose={() => setForm(null)} />
    </>
  )
}
