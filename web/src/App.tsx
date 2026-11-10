/**
 * Bona Fide web app — Phase 0 skeleton.
 *
 * Screens (built in Phase 4): Directory (/), MM profile (/mm/:account),
 * Mandate (/mandate/:id), Create (/new), Co-sign (/mandate/:id/cosign),
 * Connect key (/mandate/:id/key). NEAR wallet selector is wired in P4.1.
 * See docs/context/ui_context.md for screens and display formats.
 */
import type { ReactElement } from "react";

export function App(): ReactElement {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", maxWidth: 640, margin: "4rem auto", padding: "0 1rem" }}>
      <h1>Bona Fide</h1>
      <p>Prove you kept your market-making deals — without exposing your book.</p>
      <p style={{ color: "#888" }}>Phase 0 scaffold. Screens arrive in Phase 4.</p>
    </main>
  );
}
