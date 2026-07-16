import * as v from 'valibot';
import { TicketRepository } from './ticket-repository.js';

export type ForestLayout = Record<string, { x: number; y: number }>;

const PositionSchema = v.object({ x: v.number(), y: v.number() });

export class ForestLayoutStore {
	private worktreeDir: string;
	private repo: TicketRepository;

	constructor(worktreeDir: string, repo?: TicketRepository) {
		this.worktreeDir = worktreeDir;
		this.repo = repo ?? new TicketRepository();
	}

	read(): ForestLayout {
		const raw = this.repo.readWorktreeJson(this.worktreeDir, 'forest-layout.json');
		if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
		const result: ForestLayout = {};
		for (const [ticketNumber, value] of Object.entries(raw as Record<string, unknown>)) {
			const parsed = v.safeParse(PositionSchema, value);
			if (parsed.success) result[ticketNumber] = parsed.output;
		}
		return result;
	}

	savePositions(positions: ForestLayout): void {
		this.write({ ...this.read(), ...positions });
	}

	renameTicket(oldNumber: string, newNumber: string): void {
		const layout = this.read();
		if (!(oldNumber in layout)) return;
		const pos = layout[oldNumber];
		delete layout[oldNumber];
		layout[newNumber] = pos;
		this.write(layout);
	}

	removeTicket(ticketNumber: string): void {
		const layout = this.read();
		if (!(ticketNumber in layout)) return;
		delete layout[ticketNumber];
		this.write(layout);
	}

	translateIntoGroup(
		groupNumber: string,
		groupPosition: { x: number; y: number },
		memberNumbers: string[],
	): void {
		const layout = this.read();
		const updates: ForestLayout = { [groupNumber]: groupPosition };
		for (const memberNumber of memberNumbers) {
			const memberPosition = layout[memberNumber];
			if (memberPosition) {
				updates[memberNumber] = {
					x: memberPosition.x - groupPosition.x,
					y: memberPosition.y - groupPosition.y,
				};
			}
		}
		this.write({ ...layout, ...updates });
	}

	translateOutOfGroup(groupNumber: string, memberNumbers: string[]): void {
		const layout = this.read();
		const groupPosition = layout[groupNumber];
		const next = { ...layout };
		let changed = false;
		for (const memberNumber of memberNumbers) {
			const memberPosition = layout[memberNumber];
			if (!memberPosition) continue;
			changed = true;
			if (groupPosition) {
				next[memberNumber] = {
					x: groupPosition.x + memberPosition.x,
					y: groupPosition.y + memberPosition.y,
				};
			} else {
				delete next[memberNumber];
			}
		}
		if (changed) this.write(next);
	}

	private write(layout: ForestLayout): void {
		this.repo.writeWorktreeJson(this.worktreeDir, 'forest-layout.json', layout);
	}
}
