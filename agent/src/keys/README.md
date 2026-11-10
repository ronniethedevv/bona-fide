# keys/ (P2.1)

Enclave key handling. The X25519 keypair is derived from the dstack-provided
TEE key so the published public key is stable across restarts (R2). Decrypts
sealed-box payloads submitted by the browser. **Never** logs, prints, persists in
plaintext, or returns a key or secret (invariant I3 — tested with a canary key).
