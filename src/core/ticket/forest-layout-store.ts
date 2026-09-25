import * as v from 'valibot';
import { TicketRepository } from './ticket-repository.js';

export type ForestLayout = Record<string, { x: number; y: number }>;

const PositionSchema = v.object({ x: v.number(), y: v.number() });
const ForestLayoutRecordSchema = v.record(v.string(), v.unknown());

export class ForestLayoutStore {
	constructor(
		private readonly worktreeDir: string,
		private readonly repo = new TicketRepository(),
	) {}

	read() {
		const raw = this.repo.readWorktreeJson(this.worktreeDir, 'forest-layout.json');
		const record = v.safeParse(ForestLayoutRecordSchema, raw);
		if (!record.success) return {};
		const result: ForestLayout = {};
		for (const [ticketNumber, value] of Object.entries(record.output)) {
			const parsed = v.safeParse(PositionSchema, value);
			if (parsed.success) result[ticketNumber] = parsed.output;
		}
		return result;
	}

	renameTicket(oldTicketNumber: string, newTicketNumber: string): void {
		const layout = this.read();
		if (!(oldTicketNumber in layout)) return;
		const { [oldTicketNumber]: position, ...remaining } = layout;
		this.write({ ...remaining, [newTicketNumber]: position });
	}

	removeTicket(ticketNumber: string): void {
		const layout = this.read();
		if (!(ticketNumber in layout)) return;
		this.write(Object.fromEntries(Object.entries(layout).filter(([number]) => number !== ticketNumber)));
	}

	translateIntoGroup(
		groupNumber: string,
		groupPosition: { x: number; y: number },
		memberNumbers: string[],
	): void {
		const layout = this.read();
		const next = { ...layout, [groupNumber]: groupPosition };
		for (const memberNumber of memberNumbers) {
			const memberPosition = layout[memberNumber];
			if (memberPosition) {
				next[memberNumber] = {
					x: memberPosition.x - groupPosition.x,
					y: memberPosition.y - groupPosition.y,
				};
			}
		}
		this.write(next);
	}

	translateOutOfGroup(groupNumber: string, memberNumbers: string[]): void {
		const layout = this.read();
		const groupPosition = layout[groupNumber];
		const next = { ...layout };
		const positionedMembers = memberNumbers.filter(number => layout[number]);
		if (!positionedMembers.length) return;
		for (const memberNumber of positionedMembers) {
			const memberPosition = layout[memberNumber];
			if (groupPosition) {
				next[memberNumber] = {
					x: groupPosition.x + memberPosition.x,
					y: groupPosition.y + memberPosition.y,
				};
			} else {
				delete next[memberNumber];
			}
		}
		this.write(next);
	}

	write(layout: ForestLayout, expected?: ForestLayout): void {
		if (expected && JSON.stringify(this.read()) !== JSON.stringify(expected)) {
			throw new Error('Forest layout changed in another request. Try again.');
		}
		this.repo.writeWorktreeJson(this.worktreeDir, 'forest-layout.json', layout);
	}
}
