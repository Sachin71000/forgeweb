import { setTimeout as sleep } from "node:timers/promises";

export type RequestPacer = { wait(): Promise<void> };

/** Serial reservation prevents overlapping builds from sharing the same minute. */
export function createRequestPacer(gapMs = 61_000, clock = Date.now, delay: (ms: number) => Promise<unknown> = sleep): RequestPacer {
  let queue = Promise.resolve();
  let nextStart = 0;
  return {
    wait() {
      const reservation = queue.then(async () => {
        const waitMs = Math.max(0, nextStart - clock());
        if (waitMs) await delay(waitMs);
        nextStart = clock() + gapMs;
      });
      queue = reservation.catch(() => {});
      return reservation;
    },
  };
}
