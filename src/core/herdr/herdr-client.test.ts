import { describe, expect, it } from 'vitest';
import {
	fetchHerdrTicketState, fetchHerdrTicketStatuses, ticketStatusesFromPanes,
} from './herdr-client.js';
import type { HerdrExecFn } from './herdr-exec.js';
import { ProcessError } from '../shared/errors.js';

const WORKSPACES_JSON = JSON.stringify({
	result: { workspaces: [{ workspace_id: 'w1', label: 'alpha' }] },
});
const PANES_JSON = JSON.stringify({
	result: { panes: [{ workspace_id: 'w1', pane_id: 'w1:p2', label: 'alpha--st-47-herdr' }] },
});

function execReturning(agentListJson: string): HerdrExecFn {
	return async (key) => {
		if (key === 'herdr.workspace.list') return WORKSPACES_JSON;
		if (key === 'herdr.pane.list') return PANES_JSON;
		if (key === 'herdr.agent.list') return agentListJson;
		throw new Error(`Unexpected command: ${key}`);
	};
}

describe('fetchHerdrTicketStatuses', () => {
	it('joins agent status to the Ticket pane label', async () => {
		const agents = JSON.stringify({
			result: { agents: [{ workspace_id: 'w1', pane_id: 'w1:p2', agent_status: 'working' }] },
		});
		await expect(fetchHerdrTicketStatuses('alpha', execReturning(agents)))
			.resolves.toEqual({ 'st-47-herdr': 'working' });
	});

	it('skips a Ticket pane without an agent', async () => {
		await expect(fetchHerdrTicketStatuses(
			'alpha', execReturning('{"result":{"agents":[]}}'),
		)).resolves.toEqual({});
	});

	it('keeps the done status', async () => {
		const agents = JSON.stringify({
			result: { agents: [{ workspace_id: 'w1', pane_id: 'w1:p2', agent_status: 'done' }] },
		});
		await expect(fetchHerdrTicketStatuses('alpha', execReturning(agents)))
			.resolves.toEqual({ 'st-47-herdr': 'done' });
	});

	it('passes an out-of-vocabulary status through verbatim', async () => {
		const agents = JSON.stringify({
			result: { agents: [{ workspace_id: 'w1', pane_id: 'w1:p2', agent_status: 'frobnicating' }] },
		});
		await expect(fetchHerdrTicketStatuses('alpha', execReturning(agents)))
			.resolves.toEqual({ 'st-47-herdr': 'frobnicating' });
	});

	it('returns only Agents from the project workspace', async () => {
		const agents = JSON.stringify({
			result: { agents: [
				{ workspace_id: 'w1', pane_id: 'w1:p2', agent_status: 'idle' },
				{ workspace_id: 'w2', pane_id: 'w2:p1', agent_status: 'working' },
			] },
		});

		const state = await fetchHerdrTicketState('alpha', execReturning(agents));
		expect(state.agents).toEqual([
			{ workspace_id: 'w1', pane_id: 'w1:p2', agent_status: 'idle' },
		]);
	});

	it('throws on non-JSON agent output', async () => {
		await expect(fetchHerdrTicketStatuses('alpha', execReturning('not json')))
			.rejects.toThrow("Could not parse JSON output from 'herdr.agent.list'.");
	});

	it('throws on missing result.agents', async () => {
		await expect(fetchHerdrTicketStatuses('alpha', execReturning('{"result":{}}')))
			.rejects.toThrow("Missing agents array in output from 'herdr.agent.list'.");
	});

	it('propagates a nonzero-exit ProcessError from exec', async () => {
		const exec: HerdrExecFn = async () => {
			throw new ProcessError('herdr workspace list', 1, 'boom');
		};
		await expect(fetchHerdrTicketStatuses('alpha', exec)).rejects.toBeInstanceOf(ProcessError);
	});
});

describe('ticketStatusesFromPanes', () => {
	it('maps only panes with agents', () => {
		expect(ticketStatusesFromPanes([
			{ folderName: 'st-1', paneId: 'w1:p1', agentStatuses: ['working'] },
			{ folderName: 'st-2', paneId: 'w1:p2', agentStatuses: [] },
		])).toEqual({ 'st-1': 'working' });
	});

	it('marks duplicate panes and multiple agents as unknown', () => {
		expect(ticketStatusesFromPanes([
			{ folderName: 'st-1', paneId: 'w1:p1', agentStatuses: ['working'] },
			{ folderName: 'st-1', paneId: 'w1:p2', agentStatuses: [] },
			{ folderName: 'st-2', paneId: 'w1:p3', agentStatuses: ['idle', 'working'] },
		])).toEqual({ 'st-1': 'unknown', 'st-2': 'unknown' });
	});
});
