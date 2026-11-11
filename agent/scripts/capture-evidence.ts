/**
 * Recomputes the published evidence from chain state.
 *
 * Queries every public view method of the deployed contract over JSON-RPC and
 * writes the raw responses to `evidence/live/`, each stamped with the block it
 * was read at. Nothing in the bundle is hand-written: run this yourself and
 * diff the output against what the repository claims.
 *
 *   npm run evidence                # from agent/, or `npm run evidence` at the root
 *   CONTRACT_ID=... RPC_URL=... npm run evidence   # override the defaults
 *
 * Reads the contract id from CONTRACT_ID, else from ../deployment.yaml.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RPC = process.env.RPC_URL ?? "https://test.rpc.fastnear.com";

function contractIdFromDeployment(): string | undefined {
  try {
    const dep = readFileSync(path.resolve(process.cwd(), "../deployment.yaml"), "utf8");
    return dep.match(/^\s*contract_id:\s*(\S+)/m)?.[1];
  } catch {
    return undefined;
  }
}

const contractId = process.env.CONTRACT_ID ?? contractIdFromDeployment();
if (!contractId) {
  console.error("No contract id: set CONTRACT_ID or fill agent_contract.contract_id in ../deployment.yaml");
  process.exit(1);
}

interface ViewResult {
  method: string;
  args: Record<string, unknown>;
  block_height: number;
  block_hash: string;
  result: unknown;
}

async function view(method: string, args: Record<string, unknown>): Promise<ViewResult> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "evidence",
      method: "query",
      params: {
        request_type: "call_function",
        finality: "final",
        account_id: contractId,
        method_name: method,
        args_base64: Buffer.from(JSON.stringify(args)).toString("base64"),
      },
    }),
  });
  const body = (await res.json()) as {
    result?: { result: number[]; block_height: number; block_hash: string };
    error?: unknown;
  };
  if (!res.ok || !body.result) throw new Error(`${method} failed: ${JSON.stringify(body.error ?? res.status)}`);
  return {
    method,
    args,
    block_height: body.result.block_height,
    block_hash: body.result.block_hash,
    result: JSON.parse(Buffer.from(body.result.result).toString("utf8")),
  };
}

async function main(): Promise<void> {
  const outDir = path.resolve(process.cwd(), "../evidence/live");
  mkdirSync(outDir, { recursive: true });

  const captured: ViewResult[] = [];
  const save = (name: string, v: ViewResult) => {
    captured.push(v);
    writeFileSync(path.join(outDir, `${name}.json`), JSON.stringify(v, null, 2) + "\n");
    console.log(`  evidence/live/${name}.json  (block ${v.block_height})`);
  };

  console.log(`Reading ${contractId} via ${RPC}…`);
  save("contract-info", await view("get_contract_info", {}));
  save("agents", await view("get_agents", {}));
  save("whitelisted-agents", await view("get_whitelisted_agents_for_local", {}));
  const mandates = await view("list_mandates", {});
  save("mandates", mandates);
  save("market-makers", await view("list_mms", {}));

  for (const m of mandates.result as Array<{ id: string }>) {
    save(`verdicts-mandate-${m.id}`, await view("get_verdicts", { id: m.id, from_epoch: 0, limit: 100 }));
  }

  const summaryLines = [
    "# Live evidence — captured from chain state",
    "",
    `- **Contract:** \`${contractId}\` · [NearBlocks](https://testnet.nearblocks.io/address/${contractId})`,
    `- **RPC:** \`${RPC}\``,
    `- **Captured at:** ${new Date().toISOString()}`,
    `- **Blocks read:** ${Math.min(...captured.map((c) => c.block_height))}–${Math.max(...captured.map((c) => c.block_height))}`,
    "",
    "Every file in this directory is the raw JSON-RPC response for one public",
    "view method, including the block height and hash it was read at. Regenerate",
    "the whole directory with `npm run evidence` and diff it — the repository is",
    "never the source of these facts, the chain is.",
    "",
  ];
  writeFileSync(path.join(outDir, "SUMMARY.md"), summaryLines.join("\n"));
  console.log(`  evidence/live/SUMMARY.md`);
  console.log("Done.");
}

void main().catch((e) => {
  console.error("Evidence capture failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
