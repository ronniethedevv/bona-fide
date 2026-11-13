# Prebuilt contract wasm

`bona_fide_contract.wasm` is the binary `agent/scripts/upgrade-contract.ts`
deploys by default. It is committed because the upgrade has to be signed on the
maintainer's machine, where the Rust + wasm toolchain is not installed, and
because an upgrade is the one operation where *exactly which bytes* were
reviewed matters.

```
sha256  013523bdd865ac5e934b4d1f8b3b861996a3883f1f662c3ab5db0fba235a91d4
bytes   776393
```

## Reproducing it

```bash
cd contract
rustup target add wasm32-unknown-unknown
RUSTFLAGS="-C link-arg=--import-undefined" \
  cargo build --release --target wasm32-unknown-unknown
npx -y binaryen@123.0.0 wasm-opt -Oz --strip-debug --signext-lowering \
  target/wasm32-unknown-unknown/release/bona_fide_contract.wasm \
  -o out/bona_fide_contract.wasm
sha256sum out/bona_fide_contract.wasm
```

`--import-undefined` is needed because the NEAR host functions (`promise_batch_*`
and friends) are wasm imports resolved by the runtime, not symbols the linker
can find. `wasm-opt -Oz` is what brings the binary from 1.6 MB down to 776 KB —
it matters, because NEAR stakes 1 NEAR of the contract account's balance per
100 KB of code.

This is a plain release build, not the reproducible `cargo near` build used for
the original deployment (`Cargo.toml` → `package.metadata.near.reproducible_build`).
Byte-for-byte reproducibility is what lets a TEE *measurement* be checked
against source; it is not what makes a contract upgrade safe. What makes this
one checkable is that the hash above is printed by the upgrade script before it
broadcasts, and that the script verifies every mandate and verdict survived.
