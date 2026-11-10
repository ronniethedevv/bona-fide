# Deploying Bona Fide (testnet + Phala TEE)

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

`shade auth` stores credentials in the OS Secret Service. On WSL that daemon is
often locked/broken; if you hit `Secret Service: ... prompt was dismissed` or
`no result found`, run shade inside an isolated, auto-unlocked keyring:

```bash
sudo apt-get update && sudo apt-get install -y gnome-keyring dbus-x11
pkill -9 -f gnome-keyring-daemon 2>/dev/null; sleep 1
rm -f ~/.local/share/keyrings/*.keyring ~/.local/share/keyrings/default
export XDG_RUNTIME_DIR="$(mktemp -d)"
dbus-run-session -- bash -lc '
  eval "$(printf "" | gnome-keyring-daemon --unlock --components=secrets 2>/dev/null)"
  shade auth set all testnet create-new'
```

Run **all** later `shade` commands the same way (the credential lives in that
keyring). The `shade-env` helper in the chat notes wraps this.

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
  `mpc_contract_id` (Bona Fide uses no Chain Signatures in v1).
- The CLI you installed may be newer than the template this config was derived
  from; `shade plan` will flag any schema differences to adjust.
