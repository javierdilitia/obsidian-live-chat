/* A read the app makes once at start, tried again while the agent isn't up yet: the page can load
   before the agent has started (the dev server, or the agent restarting). Bounded, so data the
   app can't use isn't asked for forever. */

/** The waits between tries: 0.5 s, 1 s, 2 s, then 4 s; eight tries, about 20 s in all. */
const WAITS_MS = [500, 1000, 2000, 4000, 4000, 4000, 4000];

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** `read`'s answer, trying again after a failure while `live()` holds; the last error when it
 *  gives up. */
export async function retrying<T>(read: () => Promise<T>, live: () => boolean): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    let failure: unknown;
    try {
      return await read();
    } catch (error) {
      failure = error;
    }
    const wait = WAITS_MS[attempt];
    if (wait === undefined || !live()) throw failure;
    await pause(wait);
    if (!live()) throw failure;
  }
}
