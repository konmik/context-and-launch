export interface Success<A> {
	readonly type: 'Success';
	readonly value: A;
}

export interface Failure<E> {
	readonly type: 'Failure';
	readonly error: E;
}

export type Result<A, E = never> = Success<A> | Failure<E>;

export function succeed<A>(value: A): Success<A> {
	return { type: 'Success', value };
}

export function fail<E>(error: E): Failure<E> {
	return { type: 'Failure', error };
}
