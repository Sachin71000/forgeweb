import assert from "node:assert/strict";
import test from "node:test";
import { createRequestPacer } from "../providers/request-pacer.ts";

test("concurrent requests reserve separate 61-second windows without real sleeping", async () => {
  let now = 0;
  const delays: number[] = [];
  const pacer = createRequestPacer(61_000, () => now, async (ms) => { delays.push(ms); now += ms; });
  await Promise.all([pacer.wait(), pacer.wait(), pacer.wait()]);
  assert.deepEqual(delays, [61_000, 61_000]);
  now += 70_000;
  await pacer.wait();
  assert.equal(delays.length, 2);
});

test("a failed wait rejects that request without poisoning the queue", async () => {
  let now = 0;
  let fail = true;
  const pacer = createRequestPacer(61_000, () => now, async (ms) => {
    if (fail) { fail = false; throw new Error("interrupted"); }
    now += ms;
  });
  await pacer.wait();
  await assert.rejects(pacer.wait(), /interrupted/);
  await pacer.wait();
  assert.equal(now, 61_000);
});
