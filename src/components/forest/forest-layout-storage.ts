import { createContext } from 'solid-js';
import type { ForestLayout } from '~/core/ticket/forest-layout-store.js';
import { createStoredSignal, type StoredSignal } from '~/util/stored-signal.js';
import { readForestLayout, saveForestLayout } from './forest-api.js';

export const ForestLayoutContext = createContext<StoredSignal<ForestLayout>>();

export function createForestLayoutStorage(projectSlug: string): StoredSignal<ForestLayout> {
	return createStoredSignal(() => readForestLayout(projectSlug), async transform => {
		const current = await readForestLayout(projectSlug);
		return saveForestLayout(projectSlug, current, transform(current));
	});
}
