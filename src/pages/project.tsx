import type { JSX } from '@solidjs/web'
import { useParams } from '@solidjs/router'
import { Show } from 'solid-js'
import { type ProjectPageController } from '~/components/project/project-page-controller.js'
import { ProjectLauncherConfigContext, createProjectLauncherConfigStorage } from '~/components/launcher/project-launcher-config-storage.js'
import { ProjectPageContent } from '../components/project/ProjectPageContent.js'

export default function ProjectPage(props?: { ctrl?: ProjectPageController }): JSX.Element {
  const params = useParams<{
    projectSlug: string
  }>()
  return (
    <Show when={params.projectSlug} keyed>
      {(projectSlug) => (
        <ProjectLauncherConfigContext
          value={createProjectLauncherConfigStorage({
            projectSlug,
          })}
        >
          <ProjectPageContent {...props} />
        </ProjectLauncherConfigContext>
      )}
    </Show>
  )
}
