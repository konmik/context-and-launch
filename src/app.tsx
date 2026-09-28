import type { JSX } from '@solidjs/web'
import { Errored, Loading } from 'solid-js'
import { AppRouter } from './router.js'
import { AppearanceRoot } from './components/shared/AppearanceRoot.js'
import { ToastQueueRoot } from './components/shared/ToastQueueRoot.js'
import { ErrorScope } from './components/shared/ErrorScope.js'
import LoadError from './components/shared/LoadError.js'
import { errorPayload } from './core/shared/errors.js'
import { AppConfigContext, createAppConfigStorage } from './components/config/app-config-storage.js'
import { LauncherConfigContext, createSharedLauncherConfigStorage } from './components/launcher/shared-launcher-config-storage.js'
import './app.css'
import { BoardConfigContext, createBoardConfigStorage } from './components/board/board-config-storage.js'
import { CommandTemplateContext, createCommandTemplateStorage } from './components/launcher/command-template-storage.js'

export default function App(): JSX.Element {
  return (
    <AppRouter>
      {(props) => {
        const config = createAppConfigStorage()
        const launcherConfig = createSharedLauncherConfigStorage()
        const boards = createBoardConfigStorage()
        const commandTemplates = createCommandTemplateStorage()
        return (
          <Errored fallback={(error, reset) => <LoadError error={errorPayload(error(), 'Load application failed')} onRetry={reset} />}>
            <Loading fallback={<p>Loading...</p>}>
              <AppConfigContext value={config}>
                <LauncherConfigContext value={launcherConfig}>
                  <BoardConfigContext value={boards}>
                    <CommandTemplateContext value={commandTemplates}>
                      <AppearanceRoot>
                        <ToastQueueRoot>
                          <ErrorScope active={true}>{props.children}</ErrorScope>
                        </ToastQueueRoot>
                      </AppearanceRoot>
                    </CommandTemplateContext>
                  </BoardConfigContext>
                </LauncherConfigContext>
              </AppConfigContext>
            </Loading>
          </Errored>
        )
      }}
    </AppRouter>
  )
}
