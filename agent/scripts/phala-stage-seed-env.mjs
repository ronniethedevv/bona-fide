/**
 * Stage SEED_ENABLED=true into the running TEE CVM's compose, then report the
 * compose hash the CVM *will* run — without booting it.
 *
 * Why: the NEAR contract only accepts a registration whose measurements it has
 * approved, and the compose hash is one of those measurements. Changing the
 * compose therefore has to be paired with an owner `approve_measurements` call
 * BEFORE the CVM boots; otherwise every boot fails registration and the Shade
 * template re-funds a fresh agent account each retry (~0.5 NEAR a time).
 *
 * Phala's draft API makes that safe: stage the change, read `preview_compose_hash`,
 * approve it on NEAR, then apply + start.
 *
 *   node scripts/phala-stage-seed-env.mjs            # inspect + stage, print next command
 *   node scripts/phala-stage-seed-env.mjs --apply    # also apply the staged change
 *
 * Reads PHALA_API_KEY from ../.env or ./.env (never prints it).
 */
import { readFileSync } from "node:fs";

const CVM_ID = process.env.CVM_ID ?? "ec6766f1-61d3-44ac-8de5-48e7e3bfe525";
const CONTRACT = process.env.AGENT_CONTRACT_ID_OVERRIDE ?? "bona-fide-tee1.testnet";
const RPC = "https://test.rpc.fastnear.com";
const HOSTS = ["https://cloud-api.phala.network/api/v1", "https://cloud-api.phala.com/api/v1"];
const APPLY = process.argv.includes("--apply");

function apiKey() {
  if (process.env.PHALA_API_KEY) return process.env.PHALA_API_KEY.trim();
  for (const f of ["../.env", ".env"]) {
    try {
      const m = readFileSync(f, "utf8").match(/^\s*PHALA_API_KEY\s*=\s*(.+?)\s*$/m);
      if (m && m[1]) return m[1].replace(/^["']|["']$/g, "").trim();
    } catch {}
  }
  throw new Error("PHALA_API_KEY not found in ../.env or .env (and not set in the environment)");
}

let base = null;
async function api(path, init = {}) {
  const key = apiKey();
  const hosts = base ? [base] : HOSTS;
  let lastErr;
  for (const h of hosts) {
    try {
      const res = await fetch(`${h}${path}`, {
        ...init,
        headers: { "X-API-Key": key, "Content-Type": "application/json", ...(init.headers ?? {}) },
      });
      const text = await res.text();
      if (res.status === 404 && !base) {
        lastErr = new Error(`404 at ${h}${path}`);
        continue;
      }
      base = h;
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
      if (!res.ok)
        throw new Error(
          `${init.method ?? "GET"} ${path} -> ${res.status}: ${typeof json === "string" ? json.slice(0, 300) : JSON.stringify(json).slice(0, 300)}`,
        );
      return json;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** Find the docker compose YAML anywhere in a JSON blob; returns {path, yaml}. */
function findCompose(obj, path = "") {
  if (typeof obj === "string")
    return obj.includes("services:") && obj.includes(":") ? { path, yaml: obj } : null;
  if (obj && typeof obj === "object") {
    for (const [k, v] of Object.entries(obj)) {
      const hit = findCompose(v, path ? `${path}.${k}` : k);
      if (hit) return hit;
    }
  }
  return null;
}

/** Insert SEED_ENABLED: "true" into the service's environment block. */
function withSeedEnabled(yaml) {
  if (/SEED_ENABLED/.test(yaml)) return { yaml, changed: false };
  const lines = yaml.split("\n");
  const envIdx = lines.findIndex((l) => /^\s+environment:\s*$/.test(l));
  if (envIdx !== -1) {
    const indent = (lines[envIdx].match(/^(\s*)/) ?? ["", ""])[1] + "  ";
    lines.splice(envIdx + 1, 0, `${indent}SEED_ENABLED: "true"`);
    return { yaml: lines.join("\n"), changed: true };
  }
  const imgIdx = lines.findIndex((l) => /^\s+image:\s/.test(l));
  if (imgIdx === -1) throw new Error("Could not find an `environment:` or `image:` line in the compose");
  const indent = (lines[imgIdx].match(/^(\s*)/) ?? ["", ""])[1];
  lines.splice(imgIdx + 1, 0, `${indent}environment:`, `${indent}  SEED_ENABLED: "true"`);
  return { yaml: lines.join("\n"), changed: true };
}

async function approvedMeasurements() {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: CONTRACT,
        method_name: "get_approved_measurements",
        args_base64: Buffer.from("{}").toString("base64"),
      },
    }),
  });
  const json = await res.json();
  if (!json.result?.result)
    throw new Error(`get_approved_measurements failed: ${JSON.stringify(json.error ?? json).slice(0, 200)}`);
  return JSON.parse(Buffer.from(json.result.result).toString());
}

const main = async () => {
  console.log(`CVM:      ${CVM_ID}`);
  console.log(`Contract: ${CONTRACT}\n`);

  let detail;
  try {
    detail = await api(`/cvms/${CVM_ID}/compose`);
  } catch {
    detail = await api(`/cvms/${CVM_ID}`);
  }

  const found = findCompose(detail);
  if (!found)
    throw new Error(`No compose YAML found in the API response. Keys: ${Object.keys(detail).join(", ")}`);
  console.log(`--- current compose (from ${found.path}) ---\n${found.yaml}\n`);

  const { yaml: nextYaml, changed } = withSeedEnabled(found.yaml);
  if (!changed) console.log("SEED_ENABLED is already in the compose — nothing to stage.\n");
  else {
    console.log(`--- staging this compose ---\n${nextYaml}\n`);
    await api(`/cvms/${CVM_ID}/draft`, {
      method: "PATCH",
      body: JSON.stringify({ docker_compose_file: nextYaml }),
    });
    console.log("Staged (the CVM was NOT restarted).\n");
  }

  const draft = await api(`/cvms/${CVM_ID}/draft`).catch(() => null);
  const previewHash = draft?.preview_compose_hash ?? draft?.patch?.preview_compose_hash;
  if (!previewHash) {
    console.log("No preview_compose_hash in the draft response; raw draft follows:");
    console.log(JSON.stringify(draft, null, 2).slice(0, 1500));
    return;
  }
  console.log(`NEW COMPOSE HASH: ${previewHash}\n`);

  const [m] = await approvedMeasurements();
  const { mrtd, rtmr0, rtmr1, rtmr2 } = m.rtmrs;
  console.log("Run this next (approves the new hash on NEAR, keeping the enclave's own rtmrs):\n");
  console.log(
    `npx tsx scripts/fix-measurements.ts ${mrtd} ${rtmr0} ${rtmr1} ${rtmr2} ${m.key_provider_event_digest} ${previewHash}\n`,
  );

  if (APPLY) {
    await api(`/cvms/${CVM_ID}/draft/apply`, { method: "POST", body: JSON.stringify({}) });
    console.log("Applied. A stopped CVM stays stopped — start it only AFTER the command above succeeds.");
  } else {
    console.log("Then apply the staged change:  node scripts/phala-stage-seed-env.mjs --apply");
  }
};

main().catch((e) => {
  console.error("\nFAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
