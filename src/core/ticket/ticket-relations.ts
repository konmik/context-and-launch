import type { StatusJson } from './ticket-repository.js';

export type TicketRelation = { number: string; dependsOn?: string[]; memberOf?: string };

export function wouldCreateDependencyCycle(
	tickets: TicketRelation[],
	dependentNumber: string,
	dependencyNumber: string,
): boolean {
	if (dependentNumber === dependencyNumber) return true;
	const byNumber = new Map(tickets.map(t => [t.number, t]));
	const visited = new Set<string>();
	const stack = [dependencyNumber];
	while (stack.length > 0) {
		const current = stack.pop()!;
		if (current === dependentNumber) return true;
		if (visited.has(current)) continue;
		visited.add(current);
		const ticket = byNumber.get(current);
		if (!ticket?.dependsOn) continue;
		for (const dep of ticket.dependsOn) {
			if (byNumber.has(dep)) stack.push(dep);
		}
	}
	return false;
}

export function wouldCreateMembershipCycle(
	tickets: TicketRelation[],
	memberNumbers: string[],
	groupNumber: string,
): boolean {
	const memberSet = new Set(memberNumbers);
	const byNumber = new Map(tickets.map(t => [t.number, t]));
	const visited = new Set<string>();
	let current: string | undefined = groupNumber;
	while (current !== undefined) {
		if (visited.has(current)) return true;
		visited.add(current);
		if (memberSet.has(current)) return true;
		const ticket = byNumber.get(current);
		current = ticket?.memberOf && byNumber.has(ticket.memberOf) ? ticket.memberOf : undefined;
	}
	return false;
}

function mapInboundReferences(
	status: StatusJson,
	mapNumber: (referencedNumber: string) => string | undefined,
): StatusJson | undefined {
	let changed = false;
	let newDependsOn = status.dependsOn;
	if (status.dependsOn) {
		const mapped = status.dependsOn.flatMap(n => {
			const result = mapNumber(n);
			if (result !== n) changed = true;
			return result === undefined ? [] : [result];
		});
		if (changed) newDependsOn = mapped.length > 0 ? mapped : undefined;
	}
	let newMemberOf = status.memberOf;
	if (status.memberOf !== undefined) {
		const mapped = mapNumber(status.memberOf);
		if (mapped !== status.memberOf) {
			newMemberOf = mapped;
			changed = true;
		}
	}
	if (!changed) return undefined;
	return { ...status, dependsOn: newDependsOn, memberOf: newMemberOf };
}

export function rewriteInboundReferences(
	status: StatusJson,
	oldNumber: string,
	newNumber: string,
): StatusJson | undefined {
	return mapInboundReferences(status, n => (n === oldNumber ? newNumber : n));
}

export function removeInboundReferences(
	status: StatusJson,
	removedNumber: string,
): StatusJson | undefined {
	return mapInboundReferences(status, n => (n === removedNumber ? undefined : n));
}
