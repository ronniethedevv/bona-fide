# guards/ (P3.2)

Pre-sign guards. Nothing is signed unless all pass (architecture.md):

1. Mandate exists, is `Active`, and `terms_hash` matches the agent's copy.
2. The epoch has closed and has no verdict yet.
3. Metric values are within sane ranges (bps ≤ 1,000,000, no negative depth).
4. The data source is recorded (`Live` or `Replay`).
5. The agent is still a valid registered agent (view call — covers approved
   measurements/PPID and an unexpired attestation).
