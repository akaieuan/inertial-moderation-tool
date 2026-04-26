// Browser/renderer shim for Node's `crypto` module.
// @eval-kit/core's runner.ts top-levels `import { randomUUID } from "crypto"`,
// which Rollup can't bundle for the browser. This shim aliases that import
// onto the Web Crypto API (available in Electron's Chromium renderer) so the
// module loads without nodeIntegration. runSuite() etc. are never called from
// the renderer, but the import statement still has to resolve.

export const randomUUID = (): string => globalThis.crypto.randomUUID();
