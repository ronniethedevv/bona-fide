# Deploying BonaFide (testnet + Phala TEE)

The contract (`contract/`) and agent (`agent/`) deploy together with the Shade
Agent CLI. Start in **local** mode to validate, then switch to **TEE** mode for
real attestation on Phala Cloud.

## 0. Prerequisites

```bash
npm i -g @neardefi/shade-agent-cli
```

You also need Docker, a free [Phala Cloud](https://cloud.phala.network/register)
account + API key, and a NEAR testnet account (the CLI can create one).

### WSL keyring note

`shade auth` stores credentials in the OS Secret Service (the Rust `keyring`
crate). On WSL that daemon is frequently locked or has no default collection, so
you will see one of:

- `Secret Service: unlock prompt was dismissed`
- `Secret Service: no result found`  ← means there is **no default collection**

The key detail: `gnome-keyring-daemon --unlock` only *unlocks an existing*
keyring — it never **creates** one. The flag that creates the login keyring (and
aliases it as the default collection) is **`--login`**.

**Option A — restart WSL and let the GUI create it (simplest).**
From Windows PowerShell/CMD, not inside WSL:

```
wsl --shutdown
```

Reopen the Ubuntu terminal, then:

```bash
rm -rf ~/.local/share/keyrings
shade auth set all testnet create-new
```

WSLg's prompter should offer to **create** a keyring — give it an empty password
(or one you will remember) and `shade` proceeds.

**Option B — headless, using `--login`.**

```bash
sudo apt-get update && sudo apt-get install -y gnome-keyring dbus-x11
pkill -9 -f gnome-keyring-daemon 2>/dev/null; sleep 1
rm -rf ~/.local/share/keyrings
export XDG_RUNTIME_DIR="$(mktemp -d)"
dbus-run-session -- bash -lc '
  eval "$(printf "\n" | gnome-keyring-daemon --login --components=secrets,pkcs11,ssh 2>/dev/null)"
  eval "$(gnome-keyring-daemon --start --components=secrets,pkcs11,ssh 2>/dev/null)"
  shade auth set all testnet create-new'
```

The isolated `XDG_RUNTIME_DIR` stops the new daemon discovering (and deferring
to) the broken WSLg one — the cause of `discover_other_daemon: 1`.

Run **all** later `shade` commands in a session set up the same way (Option A:
the normal terminal after the restart; Option B: the same wrapper), because the
credential lives in that keyring.

## 1. Credentials

```bash
shade auth set all testnet create-new
```

Then copy `.env.example` to `.env` and fill in `AGENT_CONTRACT_ID`,
`SPONSOR_ACCOUNT_ID`, `SPONSOR_PRIVATE_KEY`, and `DOCKER_TAG`. **Never commit
`.env`** (it is gitignored).

## 2. Configure `deployment.yaml`

- Set `agent_contract.contract_id` to a unique, unused id (e.g. `bona-fide-123.testnet`).
- Set `build_docker_image.tag` to your `DOCKER_TAG`.
- Keep `environment: local` for the first run.

## 3. Local run (no TEE)

```bash
shade plan      # validate the config
shade deploy    # deploy + init the contract, approve mock measurements/ppid
# in another shell:
cd agent && npm ci && ENCLAVE_SEED_HEX=$(openssl rand -hex 32) npm run dev
shade whitelist # paste the agent account id it printed
```

The agent registers, calls `set_enc_pubkey`, and serves on `:3000`.

## 4. TEE run (Phala, real attestation)

- Set `environment: TEE` in `deployment.yaml`.
- `shade plan` then `shade deploy` — this builds the Docker image, approves the
  **real measurements**, deploys to Phala Cloud, and the enclave derives its key
  from dstack (no `ENCLAVE_SEED_HEX` needed).

## Notes

- Contract build for deploy: `cd contract && cargo near build --locked` (or let
  the CLI build from source via `deploy_from_source`).
- `new` takes `requires_tee`, `attestation_expiration_time_ms`, `owner_id` — no
  `mpc_contract_id` (BonaFide uses no Chain Signatures in v1).
- The CLI you installed may be newer than the template this config was derived
  from; `shade plan` will flag any schema differences to adjust.
