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
  /** Marker position on the MakeHuman body (feet at y = 0, head top at y = 3.4, facing +z). */
  anchor: [number, number, number];
}

export const REGIONS: RegionInfo[] = [
  { id: "brain", label: "Brain & sleep", anchor: [0, 3.24, 0.08] },
  { id: "eyes", label: "Eyes", anchor: [0.06, 3.17, 0.22] },
  { id: "inner-ear", label: "Inner ear & balance", anchor: [-0.16, 3.13, 0.04] },
  { id: "mind", label: "Mind & mood", anchor: [0, 3.62, 0.03] },
  { id: "heart", label: "Heart", anchor: [0.05, 2.42, 0.14] },
  { id: "lungs", label: "Lungs & oxygen", anchor: [-0.14, 2.52, 0.1] },
  { id: "immune", label: "Immune system", anchor: [-0.03, 2.72, 0.14] },
  { id: "gut-skin", label: "Gut & skin", anchor: [0, 1.88, 0.18] },
  { id: "kidneys", label: "Kidneys", anchor: [0.12, 2.0, -0.12] },
  { id: "bones", label: "Bones", anchor: [-0.19, 1.0, 0.07] },
  { id: "muscles", label: "Muscles", anchor: [0.46, 2.15, 0.03] },
  { id: "whole-body", label: "Whole body", anchor: [0.12, 0.3, 0.1] },
];

export const REGION = Object.fromEntries(REGIONS.map((r) => [r.id, r])) as Record<RegionId, RegionInfo>;
