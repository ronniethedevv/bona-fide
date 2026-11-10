import _sodium from "libsodium-wrappers";

let ready: typeof _sodium | null = null;

/** Resolve libsodium once (its WASM must be awaited before any call). */
export async function getSodium(): Promise<typeof _sodium> {
  if (ready === null) {
    await _sodium.ready;
    ready = _sodium;
  }
  return ready;
}
