// Must be imported before any NEAR wallet-selector code. safe-buffer /
// randombytes reference a global `Buffer` at module-eval time, which the browser
// lacks; provide it here (the Vite `buffer` alias handles `require("buffer")`).
import { Buffer } from "buffer";

if (!globalThis.Buffer) globalThis.Buffer = Buffer;
