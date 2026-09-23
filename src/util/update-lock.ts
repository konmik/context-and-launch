interface Lease {
	owner: string;
	expiresAt: number;
}

export class UpdateLock {
	private lease?: Lease;

	constructor(
		private readonly leaseMs = 30_000,
		private readonly now = Date.now,
	) {}

	private activeLease(): Lease | undefined {
		if (this.lease && this.lease.expiresAt <= this.now()) this.lease = undefined;
		return this.lease;
	}

	read<T>(read: () => T, owner?: string): T {
		if (owner && this.activeLease()) throw new Error('File is being updated in another request. Try again.');
		const value = read();
		if (owner) this.lease = { owner, expiresAt: this.now() + this.leaseMs };
		return value;
	}

	write<T>(write: () => T, owner?: string): T {
		const lease = this.activeLease();
		if (owner && lease?.owner !== owner) throw new Error('File update lock is missing or expired. Try again.');
		if (!owner && lease) throw new Error('File is being updated in another request. Try again.');
		try {
			return write();
		} finally {
			this.lease = undefined;
		}
	}

	release(owner: string): void {
		if (this.activeLease()?.owner === owner) this.lease = undefined;
	}
}
