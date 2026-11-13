/**
 * What each live vital is, where its numbers come from in the demo, and how
 * the learning layer should treat it. This is display + learning metadata only.
 * It does not decide severity; that is the rules layer (Phase 3).
 */

export type VitalKey = "heartRate" | "hrv" | "spo2" | "respRate" | "skinTemp" | "stress" | "activity";

export type Provenance = "MMASH replay" | "BIDMC replay" | "Simulated";

export interface VitalMeta {
  key: VitalKey;
  label: string;
  unit: string;
  decimals: number;
  /** Which way is a concern: "low" means only drops count as unusual; "none" is context only. */
  concern: "low" | "high" | "both" | "none";
  /** Smallest spread the baseline will use, so a very steady signal is not over-sensitive. */
  sdFloor: number;
  /** Where the reading comes from in the story (the product). */
  sensor: string;
  /** Where the number comes from in this demo. */
  provenance: Provenance;
  /** Chart y-axis bounds. */
  domain: [number, number];
}

export const VITALS: VitalMeta[] = [
  { key: "heartRate", label: "Heart rate", unit: "bpm", decimals: 0, concern: "both", sdFloor: 4,
    sensor: "Band", provenance: "MMASH replay", domain: [40, 130] },
  { key: "hrv", label: "Heart rate variability", unit: "ms", decimals: 0, concern: "low", sdFloor: 6,
    sensor: "Band", provenance: "MMASH replay", domain: [0, 120] },
  { key: "spo2", label: "Blood oxygen (SpO2)", unit: "%", decimals: 0, concern: "low", sdFloor: 1.2,
    sensor: "Band + shirt", provenance: "BIDMC replay", domain: [85, 100] },
  { key: "respRate", label: "Breathing rate", unit: "/min", decimals: 0, concern: "both", sdFloor: 1.5,
    sensor: "Shirt", provenance: "BIDMC replay", domain: [5, 35] },
  { key: "skinTemp", label: "Skin temperature", unit: "°C", decimals: 1, concern: "both", sdFloor: 0.2,
    sensor: "Band + shirt", provenance: "Simulated", domain: [31, 37] },
  { key: "stress", label: "Stress index", unit: "/100", decimals: 0, concern: "high", sdFloor: 6,
    sensor: "Band + shirt", provenance: "Simulated", domain: [0, 100] },
  { key: "activity", label: "Activity", unit: "steps/min", decimals: 0, concern: "none", sdFloor: 10,
    sensor: "Band", provenance: "MMASH replay", domain: [0, 140] },
];

export const VITAL = Object.fromEntries(VITALS.map((v) => [v.key, v])) as Record<VitalKey, VitalMeta>;

export type Values = Record<VitalKey, number | null>;
