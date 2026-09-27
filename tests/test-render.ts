import type { Matcher } from '@testing-library/dom'
import type { SelectorMatcherOptions } from '@testing-library/dom'
import type { GetByText } from '@testing-library/dom'
import type { AllByText } from '@testing-library/dom'
import type { QueryByText } from '@testing-library/dom'
import type { waitForOptions } from '@testing-library/dom'
import type { FindByText } from '@testing-library/dom'
import type { FindAllByText } from '@testing-library/dom'
import type { MatcherOptions } from '@testing-library/dom'
import type { GetByBoundAttribute } from '@testing-library/dom'
import type { AllByBoundAttribute } from '@testing-library/dom'
import type { QueryByBoundAttribute } from '@testing-library/dom'
import type { FindByBoundAttribute } from '@testing-library/dom'
import type { FindAllByBoundAttribute } from '@testing-library/dom'
import type { ByRoleMatcher } from '@testing-library/dom'
import type { ByRoleOptions } from '@testing-library/dom'
import type { GetByRole } from '@testing-library/dom'
import type { AllByRole } from '@testing-library/dom'
import type { QueryByRole } from '@testing-library/dom'
import type { FindByRole } from '@testing-library/dom'
import type { FindAllByRole } from '@testing-library/dom'
import { render as renderSolid } from '@solidjs/web'
import { getQueriesForElement, screen, fireEvent, waitFor } from '@testing-library/dom'
import type { Element } from 'solid-js'
import { createComponent } from 'solid-js'
import { ToastQueueRoot } from '~/components/shared/toast-queue.js'
import { ErrorScope } from '~/components/shared/error-presentation.js'

const disposers: (() => void)[] = []

export function renderWithErrors(view: () => Element): RenderResult {
  return render(() => createComponent(ToastQueueRoot, {
    get children() {
      return createComponent(ErrorScope, { active: true, get children() { return view() } })
    },
  }))
}

export function render(view: () => Element): RenderResult {
  const container = document.body.appendChild(document.createElement('div'))
  const dispose = renderSolid(view, container)
  disposers.push(() => {
    dispose()
    container.remove()
  })
  return {
    container,
    unmount: dispose,
    ...getQueriesForElement(container),
  }
}

export function cleanup() {
  for (const dispose of disposers.splice(0)) dispose()
}

export { fireEvent, screen, waitFor }

export interface RenderResult {
  getByLabelText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: SelectorMatcherOptions | undefined,
  ) => ReturnType<GetByText<T>>) &
    ((id: Matcher, options?: SelectorMatcherOptions | undefined) => HTMLElement)
  getAllByLabelText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: SelectorMatcherOptions | undefined,
  ) => ReturnType<AllByText<T>>) &
    ((id: Matcher, options?: SelectorMatcherOptions | undefined) => HTMLElement[])
  queryByLabelText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: SelectorMatcherOptions | undefined,
  ) => ReturnType<QueryByText<T>>) &
    ((id: Matcher, options?: SelectorMatcherOptions | undefined) => HTMLElement | null)
  queryAllByLabelText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: SelectorMatcherOptions | undefined,
  ) => ReturnType<AllByText<T>>) &
    ((id: Matcher, options?: SelectorMatcherOptions | undefined) => HTMLElement[])
  findByLabelText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: SelectorMatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindByText<T>>) &
    ((
      id: Matcher,
      options?: SelectorMatcherOptions | undefined,
      waitForElementOptions?: waitForOptions | undefined,
    ) => Promise<HTMLElement>)
  findAllByLabelText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: SelectorMatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindAllByText<T>>) &
    ((
      id: Matcher,
      options?: SelectorMatcherOptions | undefined,
      waitForElementOptions?: waitForOptions | undefined,
    ) => Promise<HTMLElement[]>)
  getByPlaceholderText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<GetByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement)
  getAllByPlaceholderText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<AllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement[])
  queryByPlaceholderText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<QueryByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement | null)
  queryAllByPlaceholderText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<AllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement[])
  findByPlaceholderText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined, waitForElementOptions?: waitForOptions | undefined) => Promise<HTMLElement>)
  findAllByPlaceholderText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindAllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined, waitForElementOptions?: waitForOptions | undefined) => Promise<HTMLElement[]>)
  getByText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: SelectorMatcherOptions | undefined,
  ) => ReturnType<GetByText<T>>) &
    ((id: Matcher, options?: SelectorMatcherOptions | undefined) => HTMLElement)
  getAllByText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: SelectorMatcherOptions | undefined,
  ) => ReturnType<AllByText<T>>) &
    ((id: Matcher, options?: SelectorMatcherOptions | undefined) => HTMLElement[])
  queryByText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: SelectorMatcherOptions | undefined,
  ) => ReturnType<QueryByText<T>>) &
    ((id: Matcher, options?: SelectorMatcherOptions | undefined) => HTMLElement | null)
  queryAllByText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: SelectorMatcherOptions | undefined,
  ) => ReturnType<AllByText<T>>) &
    ((id: Matcher, options?: SelectorMatcherOptions | undefined) => HTMLElement[])
  findByText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: SelectorMatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindByText<T>>) &
    ((
      id: Matcher,
      options?: SelectorMatcherOptions | undefined,
      waitForElementOptions?: waitForOptions | undefined,
    ) => Promise<HTMLElement>)
  findAllByText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: SelectorMatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindAllByText<T>>) &
    ((
      id: Matcher,
      options?: SelectorMatcherOptions | undefined,
      waitForElementOptions?: waitForOptions | undefined,
    ) => Promise<HTMLElement[]>)
  getByAltText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<GetByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement)
  getAllByAltText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<AllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement[])
  queryByAltText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<QueryByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement | null)
  queryAllByAltText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<AllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement[])
  findByAltText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined, waitForElementOptions?: waitForOptions | undefined) => Promise<HTMLElement>)
  findAllByAltText: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindAllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined, waitForElementOptions?: waitForOptions | undefined) => Promise<HTMLElement[]>)
  getByTitle: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<GetByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement)
  getAllByTitle: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<AllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement[])
  queryByTitle: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<QueryByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement | null)
  queryAllByTitle: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<AllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement[])
  findByTitle: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined, waitForElementOptions?: waitForOptions | undefined) => Promise<HTMLElement>)
  findAllByTitle: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindAllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined, waitForElementOptions?: waitForOptions | undefined) => Promise<HTMLElement[]>)
  getByDisplayValue: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<GetByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement)
  getAllByDisplayValue: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<AllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement[])
  queryByDisplayValue: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<QueryByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement | null)
  queryAllByDisplayValue: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<AllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement[])
  findByDisplayValue: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined, waitForElementOptions?: waitForOptions | undefined) => Promise<HTMLElement>)
  findAllByDisplayValue: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindAllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined, waitForElementOptions?: waitForOptions | undefined) => Promise<HTMLElement[]>)
  getByRole: (<T extends HTMLElement = HTMLElement>(role: ByRoleMatcher, options?: ByRoleOptions | undefined) => ReturnType<GetByRole<T>>) &
    ((role: ByRoleMatcher, options?: ByRoleOptions | undefined) => HTMLElement)
  getAllByRole: (<T extends HTMLElement = HTMLElement>(
    role: ByRoleMatcher,
    options?: ByRoleOptions | undefined,
  ) => ReturnType<AllByRole<T>>) &
    ((role: ByRoleMatcher, options?: ByRoleOptions | undefined) => HTMLElement[])
  queryByRole: (<T extends HTMLElement = HTMLElement>(
    role: ByRoleMatcher,
    options?: ByRoleOptions | undefined,
  ) => ReturnType<QueryByRole<T>>) &
    ((role: ByRoleMatcher, options?: ByRoleOptions | undefined) => HTMLElement | null)
  queryAllByRole: (<T extends HTMLElement = HTMLElement>(
    role: ByRoleMatcher,
    options?: ByRoleOptions | undefined,
  ) => ReturnType<AllByRole<T>>) &
    ((role: ByRoleMatcher, options?: ByRoleOptions | undefined) => HTMLElement[])
  findByRole: (<T extends HTMLElement = HTMLElement>(
    role: ByRoleMatcher,
    options?: ByRoleOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindByRole<T>>) &
    ((role: ByRoleMatcher, options?: ByRoleOptions | undefined, waitForElementOptions?: waitForOptions | undefined) => Promise<HTMLElement>)
  findAllByRole: (<T extends HTMLElement = HTMLElement>(
    role: ByRoleMatcher,
    options?: ByRoleOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindAllByRole<T>>) &
    ((
      role: ByRoleMatcher,
      options?: ByRoleOptions | undefined,
      waitForElementOptions?: waitForOptions | undefined,
    ) => Promise<HTMLElement[]>)
  getByTestId: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<GetByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement)
  getAllByTestId: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<AllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement[])
  queryByTestId: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<QueryByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement | null)
  queryAllByTestId: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
  ) => ReturnType<AllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined) => HTMLElement[])
  findByTestId: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined, waitForElementOptions?: waitForOptions | undefined) => Promise<HTMLElement>)
  findAllByTestId: (<T extends HTMLElement = HTMLElement>(
    id: Matcher,
    options?: MatcherOptions | undefined,
    waitForElementOptions?: waitForOptions | undefined,
  ) => ReturnType<FindAllByBoundAttribute<T>>) &
    ((id: Matcher, options?: MatcherOptions | undefined, waitForElementOptions?: waitForOptions | undefined) => Promise<HTMLElement[]>)
  container: HTMLDivElement
  unmount: () => void
}
