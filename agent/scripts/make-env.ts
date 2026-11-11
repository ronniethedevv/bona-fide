/**
 * Writes agent/.env for local development, pulling the master NEAR credentials
 * from the Shade CLI keyring (so the private key is never copy-pasted by hand),
 * generating a fresh enclave seed, and reading the contract id from
 * deployment.yaml. Run inside a `shade-env` shell so the keyring is unlocked:
 *
 *   cd agent && npx tsx scripts/make-env.ts
 */
import { Entry } from "@napi-rs/keyring";
import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const SERVICE = "shade-agent-cli";
const NETWORK = "testnet";

const accountId = new Entry(SERVICE, `${NETWORK}_account`).getPassword();
const privateKey = new Entry(SERVICE, `${NETWORK}_privateKey`).getPassword();
if (!accountId || !privateKey) {
  console.error(
    "No Shade credentials found in the keyring.\n" +
      "Run `shade auth set all testnet create-new` inside a shade-env shell first.",
  );
  process.exit(1);
}

const depPath = path.resolve(process.cwd(), "../deployment.yaml");
const contractId = readFileSync(depPath, "utf8").match(/^\s*contract_id:\s*(\S+)/m)?.[1];
if (!contractId) {
  console.error("Could not read agent_contract.contract_id from ../deployment.yaml");
  process.exit(1);
}

const seed = randomBytes(32).toString("hex");
const envPath = path.resolve(process.cwd(), ".env");
writeFileSync(
  envPath,
  [
    `AGENT_CONTRACT_ID=${contractId}`,
    `SPONSOR_ACCOUNT_ID=${accountId}`,
    `SPONSOR_PRIVATE_KEY=${privateKey}`,
    `NEAR_NETWORK=${NETWORK}`,
    `DATA_SOURCE=replay`,
    `ENCLAVE_SEED_HEX=${seed}`,
    `SEED_ENABLED=true`,
    `PORT=3000`,
    "",
  ].join("\n"),
);
console.log(`Wrote ${envPath}`);
console.log(`  AGENT_CONTRACT_ID = ${contractId}`);
console.log(`  SPONSOR_ACCOUNT_ID = ${accountId}`);
console.log("  (private key + enclave seed written to the file, not shown here)");
