import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatManager } from './heartbeat.js';

describe('HeartbeatManager', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts shutdown timer when last peer disconnects', () => {
		const exit = vi.fn();
		const hb = new HeartbeatManager(exit);

		hb.addPeer();
		hb.removePeer();

		expect(hb.isShutdownScheduled()).toBe(true);
		expect(exit).not.toHaveBeenCalled();

		vi.advanceTimersByTime(30_000);
		expect(exit).toHaveBeenCalledOnce();
	});

	it('cancels shutdown timer when a peer reconnects within 30s', () => {
		const exit = vi.fn();
		const hb = new HeartbeatManager(exit);

		hb.addPeer();
		hb.removePeer();
		expect(hb.isShutdownScheduled()).toBe(true);

		vi.advanceTimersByTime(15_000);
		hb.addPeer();
		expect(hb.isShutdownScheduled()).toBe(false);

		vi.advanceTimersByTime(30_000);
		expect(exit).not.toHaveBeenCalled();
	});

	it('tracks multiple peers correctly', () => {
		const exit = vi.fn();
		const hb = new HeartbeatManager(exit);

		hb.addPeer();
		hb.addPeer();
		hb.addPeer();
		expect(hb.getPeerCount()).toBe(3);

		hb.removePeer();
		expect(hb.getPeerCount()).toBe(2);
		expect(hb.isShutdownScheduled()).toBe(false);

		hb.removePeer();
		expect(hb.getPeerCount()).toBe(1);
		expect(hb.isShutdownScheduled()).toBe(false);

		hb.removePeer();
		expect(hb.getPeerCount()).toBe(0);
		expect(hb.isShutdownScheduled()).toBe(true);

		vi.advanceTimersByTime(30_000);
		expect(exit).toHaveBeenCalledOnce();
	});

	it('does not go below zero peers', () => {
		const exit = vi.fn();
		const hb = new HeartbeatManager(exit);

		hb.removePeer();
		expect(hb.getPeerCount()).toBe(0);
		expect(hb.isShutdownScheduled()).toBe(true);

		vi.advanceTimersByTime(30_000);
		expect(exit).toHaveBeenCalledOnce();
	});

	it('does not call exit before 30s elapses', () => {
		const exit = vi.fn();
		const hb = new HeartbeatManager(exit);

		hb.addPeer();
		hb.removePeer();

		vi.advanceTimersByTime(29_999);
		expect(exit).not.toHaveBeenCalled();

		vi.advanceTimersByTime(1);
		expect(exit).toHaveBeenCalledOnce();
	});

	it('resets timer if a peer disconnects and another connects then disconnects', () => {
		const exit = vi.fn();
		const hb = new HeartbeatManager(exit);

		hb.addPeer();
		hb.removePeer();

		vi.advanceTimersByTime(20_000);
		expect(exit).not.toHaveBeenCalled();

		// Reconnect resets the timer
		hb.addPeer();
		hb.removePeer();

		vi.advanceTimersByTime(20_000);
		expect(exit).not.toHaveBeenCalled();

		vi.advanceTimersByTime(10_000);
		expect(exit).toHaveBeenCalledOnce();
	});

	it('rapid connect/disconnect does not leak timers', () => {
		const exit = vi.fn();
		const hb = new HeartbeatManager(exit);

		// Rapid connect/disconnect cycles
		for (let i = 0; i < 100; i++) {
			hb.addPeer();
			hb.removePeer();
		}

		// Only one timer should be active (the last removePeer's timer)
		expect(hb.isShutdownScheduled()).toBe(true);
		expect(hb.getPeerCount()).toBe(0);

		// Exit should only fire once after 30s
		vi.advanceTimersByTime(30_000);
		expect(exit).toHaveBeenCalledOnce();
	});

	it('double removePeer at zero does not start duplicate timers', () => {
		const exit = vi.fn();
		const hb = new HeartbeatManager(exit);

		hb.addPeer();
		hb.removePeer();
		hb.removePeer(); // spurious extra remove

		expect(hb.getPeerCount()).toBe(0);
		expect(hb.isShutdownScheduled()).toBe(true);

		vi.advanceTimersByTime(30_000);
		expect(exit).toHaveBeenCalledOnce();
	});

	it('late close event after reconnect does not trigger shutdown while peer is alive', () => {
		const exit = vi.fn();
		const hb = new HeartbeatManager(exit);

		// Old connection opened
		hb.addPeer();
		// New connection opens before old one closes (overlapping connections)
		hb.addPeer();
		// Old connection close arrives
		hb.removePeer();

		// Still one active peer - no shutdown
		expect(hb.getPeerCount()).toBe(1);
		expect(hb.isShutdownScheduled()).toBe(false);

		vi.advanceTimersByTime(30_000);
		expect(exit).not.toHaveBeenCalled();
	});

	it('reconnect during shutdown window cancels shutdown and survives subsequent disconnect cycle', () => {
		const exit = vi.fn();
		const hb = new HeartbeatManager(exit);

		hb.addPeer();
		hb.removePeer();
		expect(hb.isShutdownScheduled()).toBe(true);

		// 25s into the 30s window, a new peer connects
		vi.advanceTimersByTime(25_000);
		hb.addPeer();
		expect(hb.isShutdownScheduled()).toBe(false);

		// That peer stays for a while then disconnects
		vi.advanceTimersByTime(10_000);
		hb.removePeer();
		expect(hb.isShutdownScheduled()).toBe(true);

		// The full 30s from THIS disconnect must elapse
		vi.advanceTimersByTime(29_999);
		expect(exit).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(exit).toHaveBeenCalledOnce();
	});

	it('addPeer after exitFn fired resets state for new lifecycle', () => {
		const exit = vi.fn();
		const hb = new HeartbeatManager(exit);

		hb.addPeer();
		hb.removePeer();
		vi.advanceTimersByTime(30_000);
		expect(exit).toHaveBeenCalledOnce();

		// A new peer arrives after exit was called (exitFn didn't actually kill process)
		hb.addPeer();
		expect(hb.getPeerCount()).toBe(1);
		expect(hb.isShutdownScheduled()).toBe(false);

		// When this peer disconnects, a fresh shutdown timer starts
		hb.removePeer();
		expect(hb.isShutdownScheduled()).toBe(true);

		vi.advanceTimersByTime(30_000);
		expect(exit).toHaveBeenCalledTimes(2);
	});

	it('shutdown timer reference is cleared after it fires', () => {
		const exit = vi.fn();
		const hb = new HeartbeatManager(exit);

		hb.addPeer();
		hb.removePeer();
		vi.advanceTimersByTime(30_000);
		expect(exit).toHaveBeenCalledOnce();

		// After timer fires, isShutdownScheduled should be false
		// so a new removePeer can start a fresh timer
		expect(hb.isShutdownScheduled()).toBe(false);
	});

	it('close without matching open starts shutdown (peer never fully connected)', () => {
		const exit = vi.fn();
		const hb = new HeartbeatManager(exit);

		// Framework calls close without open (failed upgrade)
		hb.removePeer();
		expect(hb.getPeerCount()).toBe(0);
		expect(hb.isShutdownScheduled()).toBe(true);

		// Another valid peer connects - shutdown cancelled
		hb.addPeer();
		expect(hb.isShutdownScheduled()).toBe(false);
		expect(hb.getPeerCount()).toBe(1);

		vi.advanceTimersByTime(30_000);
		expect(exit).not.toHaveBeenCalled();
	});
});
