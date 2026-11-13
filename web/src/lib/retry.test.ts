/* Reads the app makes once at start try again while the agent isn't up yet (the dev server or the
   agent restarting): 0.5 s, 1 s, 2 s, then every 4 s, about 20 s in all. */
import { retrying } from "./retry";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function failing(times: number) {
  let calls = 0;
  const read = vi.fn(() => {
    calls += 1;
    return calls <= times ? Promise.reject(new Error("down")) : Promise.resolve("answer");
  });
  return read;
}

test("tries again until the read answers", async () => {
  const read = failing(2);
  const answer = retrying(read, () => true);

  await vi.advanceTimersByTimeAsync(500 + 1000);

  await expect(answer).resolves.toBe("answer");
  expect(read).toHaveBeenCalledTimes(3);
});

test("gives up after about 20 s, with the last error", async () => {
  const read = failing(Infinity);
  const answer = retrying(read, () => true);
  const settled = expect(answer).rejects.toThrow("down");

  await vi.advanceTimersByTimeAsync(20_000);

  await settled;
  expect(read).toHaveBeenCalledTimes(8);
});

test("stops trying once its caller is gone", async () => {
  const read = failing(Infinity);
  let live = true;
  const answer = retrying(read, () => live);
  const settled = expect(answer).rejects.toThrow("down");

  await vi.advanceTimersByTimeAsync(100); // the first try failed; it waits to try again
  live = false;
  await vi.advanceTimersByTimeAsync(20_000);

  await settled;
  expect(read).toHaveBeenCalledTimes(1);
});
