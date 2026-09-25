import { createContext, createEffect, createMemo } from 'solid-js';
import type { TicketOrder } from '~/core/ticket/ticket-order-data.js';
import { createStoredSignal, type StoredSignal } from '~/util/stored-signal.js';
import { readTicketOrder, saveTicketOrder } from '../ticket/ticket-api.js';

export const TicketOrderContext = createContext<StoredSignal<TicketOrder>>();

export function createTicketOrderStorage(
	props: { projectSlug: string; order: TicketOrder },
	persistence = { read: readTicketOrder, save: saveTicketOrder },
): StoredSignal<TicketOrder> {
	const project = createMemo(() => {
		const projectSlug = props.projectSlug;
		return createStoredSignal(() => props.order, async transform => {
			const current = await persistence.read(projectSlug);
			if (current.type === 'Failure') return current;
			return persistence.save(projectSlug, current.value, transform(current.value));
		});
	});
	createEffect(() => ({ order: props.order, storage: project() }), ({ storage }) => { void storage.refresh(); });
	return {
		get: () => project().get(),
		update: transform => project().update(transform),
		refresh: () => project().refresh(),
	};
}
