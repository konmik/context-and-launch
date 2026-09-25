import { createContext } from 'solid-js';
import { useAction } from '@solidjs/router';
import type { TicketInfo } from '~/core/ticket/ticket-store.js';
import { createStoredSignal, type StoredSignal } from '~/util/stored-signal.js';
import { getTicket, saveTicketStatus } from './ticket-api.js';

export const TicketStatusContext = createContext<StoredSignal<TicketInfo>>();

export function createTicketStatusStorage(projectSlug: string, folderName: string): StoredSignal<TicketInfo> {
	const save = useAction(saveTicketStatus);
	const storage: StoredSignal<TicketInfo> = createStoredSignal(
		() => getTicket(projectSlug, folderName),
		async transform => {
			const current = storage.get();
			const result = await save(projectSlug, JSON.stringify(current), JSON.stringify(transform(current)));
			if (result.type === 'Success') folderName = result.value.folderName;
			return result;
		},
	);
	return storage;
}
