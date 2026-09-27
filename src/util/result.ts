export interface Success<A> {
  readonly type: 'Success'
  readonly value: A
}

export interface Failure<E> {
  readonly type: 'Failure'
  readonly error: E
}

export type Result<A, E = never> = Success<A> | Failure<E>

export function succeed<A>(value: A): Success<A> {
  return {
    type: 'Success',
    value,
  }
}

export function fail<E>(error: E): Failure<E> {
  return {
    type: 'Failure',
    error,
  }
}

export function isSuccess<A, E>(result: Result<A, E>): result is Success<A> {
  return result.type === 'Success'
}

export function isFailure<A, E>(result: Result<A, E>): result is Failure<E> {
  return result.type === 'Failure'
}

export function match<A, E, B, C>(result: Result<A, E>, onSuccess: (value: A) => B, onFailure: (error: E) => C): B | C {
  return isSuccess(result) ? onSuccess(result.value) : onFailure(result.error)
}

export function onSuccess<A, E>(result: Result<A, E>, callback: (value: A) => void): Result<A, E> {
  if (isSuccess(result)) callback(result.value)
  return result
}

export function onFailure<A, E>(result: Result<A, E>, callback: (error: E) => void): Result<A, E> {
  if (isFailure(result)) callback(result.error)
  return result
}
