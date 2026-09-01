export type ImportSubtaskStatus =
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'waiting';

export interface ImportSubtaskState<Result = unknown> {
  index: number;
  status: ImportSubtaskStatus;
  attempts: number;
  value?: Result;
  failureStage?: string;
  retryable?: boolean;
}

export type ImportAttemptOutcome<Result> =
  | { ok: true; value: Result }
  | { ok: false; failureStage: string; retryable: boolean };

export interface ImportBatchResult<Result> {
  states: ImportSubtaskState<Result>[];
  circuitOpen: boolean;
}

interface ProcessImportSubtasksOptions<Item, Result> {
  items: readonly Item[];
  process: (
    item: Item,
    index: number,
    attempt: number,
  ) => Promise<ImportAttemptOutcome<Result>>;
  initialStates?: readonly ImportSubtaskState<Result>[];
  concurrency?: number;
  maxAttempts?: number;
  timeoutCircuitThreshold?: number;
  onUpdate?: (states: readonly ImportSubtaskState<Result>[]) => void;
}

/** Coalesces repeated queue starts and never runs two drains concurrently. */
export function createSingleFlightScheduler(
  run: () => Promise<void>,
  shouldRunAgain: () => boolean,
): () => Promise<void> {
  let flight: Promise<void> | null = null;
  const schedule = (): Promise<void> => {
    if (flight) return flight;
    flight = run().finally(() => {
      flight = null;
      if (shouldRunAgain()) void schedule();
    });
    return flight;
  };
  return schedule;
}

function initialState<Result>(
  index: number,
  previous: readonly ImportSubtaskState<Result>[] | undefined,
): ImportSubtaskState<Result> {
  return previous?.find((state) => state.index === index)
    ?? { index, status: 'pending', attempts: 0 };
}

export function resetImportSubtasksForRetry<Result>(
  states: readonly ImportSubtaskState<Result>[],
): ImportSubtaskState<Result>[] {
  return states.map((state) => {
    if (state.status === 'succeeded') return state;
    return { index: state.index, status: 'pending', attempts: 0 };
  });
}

export async function processImportSubtasks<Item, Result>(
  options: ProcessImportSubtasksOptions<Item, Result>,
): Promise<ImportBatchResult<Result>> {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 2));
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? 2));
  const timeoutCircuitThreshold = Math.max(
    1,
    Math.floor(options.timeoutCircuitThreshold ?? 2),
  );
  const states = options.items.map((_item, index) => (
    initialState(index, options.initialStates)
  ));
  const queue = states
    .filter((state) => state.status !== 'succeeded')
    .map((state) => state.index);

  let active = 0;
  let cursor = 0;
  let consecutiveTimeouts = 0;
  let circuitOpen = false;

  const emit = () => options.onUpdate?.(states.map((state) => ({ ...state })));

  const markRemainingWaiting = () => {
    for (let offset = cursor; offset < queue.length; offset += 1) {
      const state = states[queue[offset]];
      if (state.status === 'pending') {
        states[state.index] = {
          index: state.index,
          status: 'waiting',
          attempts: state.attempts,
          failureStage: 'circuit_open',
          retryable: true,
        };
      }
    }
  };

  return new Promise<ImportBatchResult<Result>>((resolve) => {
    const finishIfSettled = () => {
      if (active > 0) return false;
      if (!circuitOpen && cursor < queue.length) return false;
      resolve({ states, circuitOpen });
      return true;
    };

    const pump = () => {
      if (circuitOpen) {
        markRemainingWaiting();
        emit();
        finishIfSettled();
        return;
      }

      while (active < concurrency && cursor < queue.length && !circuitOpen) {
        const index = queue[cursor];
        cursor += 1;
        const state = states[index];
        if (state.status === 'succeeded') continue;

        const attempt = state.attempts + 1;
        states[index] = { index, status: 'processing', attempts: attempt };
        active += 1;
        emit();

        void options.process(options.items[index], index, attempt)
          .catch((): ImportAttemptOutcome<Result> => ({
            ok: false,
            failureStage: 'client_error',
            retryable: true,
          }))
          .then((outcome) => {
            if (outcome.ok) {
              consecutiveTimeouts = 0;
              states[index] = {
                index,
                status: 'succeeded',
                attempts: attempt,
                value: outcome.value,
              };
              return;
            }

            const timedOut = outcome.failureStage === 'client_timeout';
            consecutiveTimeouts = timedOut ? consecutiveTimeouts + 1 : 0;
            states[index] = {
              index,
              status: 'failed',
              attempts: attempt,
              failureStage: outcome.failureStage,
              retryable: outcome.retryable,
            };

            if (timedOut && consecutiveTimeouts >= timeoutCircuitThreshold) {
              circuitOpen = true;
              return;
            }
            if (!timedOut && outcome.retryable && attempt < maxAttempts) {
              states[index] = { index, status: 'pending', attempts: attempt };
              queue.push(index);
            }
          })
          .finally(() => {
            active -= 1;
            if (circuitOpen) markRemainingWaiting();
            emit();
            const settled = finishIfSettled();
            if (!settled && active === 0) pump();
          });
      }

      finishIfSettled();
    };

    emit();
    pump();
  });
}
