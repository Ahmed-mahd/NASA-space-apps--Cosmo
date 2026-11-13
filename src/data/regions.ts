/**
 * Body regions on the hologram. The first 11 are the approved Checkpoint A
 * regions (they group the 17 NASA risks). "kidneys" is added for scenario 2
 * (flank pain -> kidney ultrasound check); it has no NASA risk page of its own.
 */
import type { BodyRegion } from "./nasa";

export type RegionId = BodyRegion | "kidneys";

export interface RegionInfo {
  id: RegionId;
  label: string;
  /** Marker position on the 3D body (feet at y = 0, head top near y = 3.4). */
  anchor: [number, number, number];
}

export const REGIONS: RegionInfo[] = [
  { id: "brain", label: "Brain & sleep", anchor: [0, 3.24, 0.02] },
  { id: "eyes", label: "Eyes", anchor: [0.08, 3.12, 0.2] },
  { id: "inner-ear", label: "Inner ear & balance", anchor: [-0.22, 3.1, 0] },
  { id: "mind", label: "Mind & mood", anchor: [0, 3.62, 0] },
  { id: "heart", label: "Heart", anchor: [0.08, 2.38, 0.12] },
  { id: "lungs", label: "Lungs & oxygen", anchor: [-0.16, 2.48, 0.1] },
  { id: "immune", label: "Immune system", anchor: [-0.06, 2.72, 0.1] },
  { id: "gut-skin", label: "Gut & skin", anchor: [0, 1.88, 0.16] },
  { id: "kidneys", label: "Kidneys", anchor: [0.16, 2.0, -0.08] },
  { id: "bones", label: "Bones", anchor: [-0.18, 1.0, 0.06] },
  { id: "muscles", label: "Muscles", anchor: [0.56, 2.05, 0] },
  { id: "whole-body", label: "Whole body", anchor: [0, 0.32, 0.3] },
];

export const REGION = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, RegionInfo>;
