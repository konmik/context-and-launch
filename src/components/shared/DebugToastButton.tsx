import type { JSX } from '@solidjs/web'
import { Bug } from '~/components/ui/icons.js'
import { MenuRoot, MenuTrigger, MenuContent, MenuItem } from '~/components/ui/menu'
import { useToastQueue } from './toast-queue.js'

export default function DebugToastButton(): JSX.Element {
  const toasts = useToastQueue()

  return (
    <MenuRoot
      trigger={
        <MenuTrigger class="btn-icon" title="Debug" aria-label="Debug" data-testid="debug-toast-button">
          <Bug size={16} />
        </MenuTrigger>
      }
    >
      <MenuContent class="min-w-[180px]">
        <MenuItem
          value="send-error-toast"
          data-testid="debug-send-error-toast-menuitem"
          onClick={() =>
            toasts.enqueue({
              title: 'Debug error',
              description: 'This is a sample user-facing error sent through the shared toast queue.',
              details: 'Select Send error toast again to queue another error. Dismiss this toast to show the next queued error.',
            })
          }
        >
          Send error toast
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  )
}
