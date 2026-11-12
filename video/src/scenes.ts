/**
 * The scene plan.
 *
 * Timing is data, not code: every scene declares a *planned* length used only
 * until a voiceover clip for it exists. Once `public/vo/<vo>` is dropped in,
 * calculateMetadata measures it and the scene resizes to the narration —
 * narration is never cut to fit the picture.
 *
 * Clip scenes additionally clamp to the footage actually captured, so a scene
 * can never outrun its own video.
 */
export type SceneId =
  | "title"
  | "problem"
  | "landing"
  | "directory"
  | "pass"
  | "fail"
  | "keycheck"
  | "readonly"
  | "terminal"
  | "attest"
  | "closing"
  | "end";

export interface ScenePlan {
  id: SceneId;
  /** Voiceover file in public/vo. Absent files simply fall back to `planned`. */
  vo: string;
  /** Seconds, used until the voiceover exists. */
  planned: number;
  /** Footage in public/clips, when this scene shows the product. */
  clip?: string;
  /** Breathing room after the narration stops, in seconds. */
  tail?: number;
}

export const PLAN: ScenePlan[] = [
  { id: "title", vo: "vo-01-title.mp3", planned: 4.5, tail: 0.8 },
  { id: "problem", vo: "vo-02-problem.mp3", planned: 7 },
  { id: "landing", vo: "vo-03-landing.mp3", planned: 6.5, clip: "landing" },
  { id: "directory", vo: "vo-04-directory.mp3", planned: 5, clip: "directory" },
  { id: "pass", vo: "vo-05-pass.mp3", planned: 7, clip: "mandate-pass" },
  { id: "fail", vo: "vo-06-fail.mp3", planned: 7.5, clip: "mandate-fail" },
  { id: "keycheck", vo: "vo-07-keycheck.mp3", planned: 8, clip: "keycheck" },
  { id: "readonly", vo: "vo-08-readonly.mp3", planned: 7 },
  { id: "terminal", vo: "vo-09-terminal.mp3", planned: 8 },
  { id: "attest", vo: "vo-10-attest.mp3", planned: 9 },
  { id: "closing", vo: "vo-11-closing.mp3", planned: 6.5 },
  { id: "end", vo: "vo-12-end.mp3", planned: 5, tail: 1.2 },
];

/** Lead-in before narration starts, so a scene never cuts on the first syllable. */
export const LEAD_IN = 0.45;
export const DEFAULT_TAIL = 0.6;
