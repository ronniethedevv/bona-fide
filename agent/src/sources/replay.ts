/**
 * Replay source (P2.4). Reads simulated MM data from a fixture file and serves
 * it epoch by epoch. Always reports `dataSource() === "Replay"` so it is
 * labelled on-chain and in the UI (invariant I9). Never touches the network.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  type DataSourceKind,
  type EpochData,
  EpochDataSchema,
  type EpochSource,
  SourceAuthError,
} from "./types.js";

export const ReplayFixtureSchema = z.object({
  label: z.string(),
  pair: z.string(),
  base: z.string(),
  quote: z.string(),
  epochSecs: z.number().int().positive(),
  sampleSecs: z.number().int().positive(),
  epochs: z.array(EpochDataSchema).min(1),
});
export type ReplayFixture = z.infer<typeof ReplayFixtureSchema>;

export const DEFAULT_REPLAY_DIR =
  process.env.REPLAY_FIXTURES_DIR ?? path.resolve(process.cwd(), "../fixtures/replay");

/** Load and validate a replay fixture by name (e.g. "honest-mm"). */
export async function loadReplayFixture(
  name: string,
  dir: string = DEFAULT_REPLAY_DIR,
): Promise<ReplayFixture> {
  const file = path.join(dir, `${name}.json`);
  const raw = await readFile(file, "utf8");
  return ReplayFixtureSchema.parse(JSON.parse(raw));
}

export class ReplaySource implements EpochSource {
  constructor(private readonly fixture: ReplayFixture) {}

  dataSource(): DataSourceKind {
    return "Replay";
  }

  epochCount(): number {
    return this.fixture.epochs.length;
  }

  expectedSamples(): number {
    return Math.floor(this.fixture.epochSecs / this.fixture.sampleSecs);
  }

  async readEpoch(epoch: number): Promise<EpochData> {
    const data = this.fixture.epochs[epoch];
    if (!data) {
      throw new RangeError(`epoch ${epoch} out of range (have ${this.epochCount()})`);
    }
    if (data.authError) {
      throw new SourceAuthError();
    }
    return data;
  }
}
