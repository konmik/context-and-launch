import { Errored, Loading } from "solid-js";
import { AppRouter } from "./router.js";
import { AppConfigContext, createAppConfigStorage } from './components/config/app-config-storage.js';
import {
  LauncherConfigContext, createSharedLauncherConfigStorage,
} from './components/launcher/shared-launcher-config-storage.js';
import "./app.css";
import { BoardConfigContext, createBoardConfigStorage } from './components/board/board-config-storage.js';
import {
  CommandTemplateContext, createCommandTemplateStorage,
} from './components/launcher/command-template-storage.js';

export default function App() {
  return (
    <AppRouter>{(props) => {
      const config = createAppConfigStorage();
      const launcherConfig = createSharedLauncherConfigStorage();
      const boards = createBoardConfigStorage();
      const commandTemplates = createCommandTemplateStorage();
      return (
        <Errored fallback={(error, reset) => (
          <div
            class="mx-auto mt-10 max-w-2xl rounded-lg border border-destructive/40 bg-card p-6"
            role="alert"
          >
            <h2 class="mb-2 text-lg font-semibold">Something went wrong</h2>
            <p class="mb-4 whitespace-pre-wrap text-sm text-destructive">
              {String(error() instanceof Error ? error() : error())}
            </p>
            <button class="btn-primary" onClick={reset}>Retry</button>
          </div>
        )}>
          <Loading fallback={<p>Loading...</p>}>
            <AppConfigContext value={config}>
              <LauncherConfigContext value={launcherConfig}>
                <BoardConfigContext value={boards}>
                  <CommandTemplateContext value={commandTemplates}>{props.children}</CommandTemplateContext>
                </BoardConfigContext>
              </LauncherConfigContext>
            </AppConfigContext>
          </Loading>
        </Errored>
      );
    }}</AppRouter>
  );
}
