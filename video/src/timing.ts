import { parseMedia } from "@remotion/media-parser";
import { staticFile } from "remotion";
import clips from "./clips.json";
import cueData from "./cues.json";
import { DEFAULT_TAIL, LEAD_IN, PLAN, type SceneId } from "./scenes";
import { FPS } from "./theme";

export interface SceneTiming {
  id: SceneId;
  durationInFrames: number;
  /** Frame the narration starts on, so visuals can be cued to it. */
  voStartFrame: number;
  /** Present only when the clip really exists on disk. */
  clip?: string;
  vo?: string;
  /** Sentence starts within the scene, in frames — picture cues to speech. */
  cues?: number[];
}

export interface DemoProps extends Record<string, unknown> {
  scenes: SceneTiming[];
  music: string | null;
}

const clipSeconds = (clips as { durations?: Record<string, number> }).durations ?? {};
const available = new Set((clips as { available: string[] }).available);

async function durationOf(path: string): Promise<number | null> {
  try {
    const { slowDurationInSeconds } = await parseMedia({
      src: staticFile(path),
      fields: { slowDurationInSeconds: true },
      acknowledgeRemotionLicense: true,
    });
    return slowDurationInSeconds ?? null;
  } catch {
    return null; // not provided yet — fall back to the planned length
  }
}

/**
 * Size the film to the narration. Called by Remotion before rendering, so the
 * timeline is correct in the Studio as well as in a render.
 */
export async function calculateDemoMetadata(): Promise<{
  durationInFrames: number;
  props: DemoProps;
}> {
  const scenes: SceneTiming[] = [];

  for (const plan of PLAN) {
    const voSeconds = await durationOf(`vo/${plan.vo}`);
    const tail = plan.tail ?? DEFAULT_TAIL;
    const wanted = voSeconds === null ? plan.planned : LEAD_IN + voSeconds + tail;

    // A clip scene must never outrun the footage it is showing.
    const hasClip = plan.clip !== undefined && available.has(plan.clip);
    const ceiling = hasClip ? (clipSeconds[plan.clip as string] ?? Infinity) : Infinity;
    const seconds = Math.min(wanted, ceiling);

    const rawCues = (cueData as Record<string, number[]>)[plan.vo];
    const cues =
      voSeconds === null || rawCues === undefined
        ? undefined
        : rawCues.map((sec) => Math.round((LEAD_IN + sec) * FPS));

    scenes.push({
      id: plan.id,
      cues,
      durationInFrames: Math.max(30, Math.round(seconds * FPS)),
      voStartFrame: Math.round((voSeconds === null ? 0.3 : LEAD_IN) * FPS),
      clip: hasClip ? plan.clip : undefined,
      vo: voSeconds === null ? undefined : `vo/${plan.vo}`,
    });
  }

  const music = await durationOf("music/bed.mp3");

  return {
    durationInFrames: scenes.reduce((a, s) => a + s.durationInFrames, 0),
    props: { scenes, music: music === null ? null : "music/bed.mp3" },
  };
}
