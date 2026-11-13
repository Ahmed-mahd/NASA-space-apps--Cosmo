"use client";

import { useEffect, useRef, useState } from "react";
import { Baseline, type Deviation } from "./baseline";
import { ReplayStream, type Reading, type StreamPhase } from "./stream";
import { VITALS, type VitalKey } from "./vitals";

export type HistoryPoint = { t: number; clock: string } & Partial<Record<VitalKey, number>>;

export interface VitalsState {
  reading: Reading;
  deviations: Record<VitalKey, Deviation>;
  ranges: Record<VitalKey, [number, number]>;
  history: HistoryPoint[];
}

const KEEP = 300; // seconds of history kept for charts

/** Runs the sensor replay through the learning layer once per tick, in the browser. */
export function useVitals() {
  const engine = useRef<{ stream: ReplayStream; baseline: Baseline } | null>(null);
  const history = useRef<HistoryPoint[]>([]);
  const [state, setState] = useState<VitalsState | null>(null);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [phase, setPhaseState] = useState<StreamPhase>("normal");

  useEffect(() => {
    if (paused) return;
    if (!engine.current) engine.current = { stream: new ReplayStream(), baseline: Baseline.seeded() };
    const { stream, baseline } = engine.current;
    const tick = () => {
      const reading = stream.next();
      const deviations = baseline.update(reading);
      const point: HistoryPoint = { t: reading.t, clock: reading.clock };
      const ranges = {} as Record<VitalKey, [number, number]>;
      for (const v of VITALS) {
        const x = reading.values[v.key];
        if (x != null) point[v.key] = Math.round(x * 10) / 10;
        ranges[v.key] = baseline.range(v.key);
      }
      history.current = [...history.current.slice(-(KEEP - 1)), point];
      setState({ reading, deviations, ranges, history: history.current });
    };
    tick();
    const id = setInterval(tick, 1000 / speed);
    return () => clearInterval(id);
  }, [speed, paused]);

  const setPhase = (p: StreamPhase) => {
    engine.current?.stream.setPhase(p);
    setPhaseState(p);
  };

  return { state, speed, setSpeed, paused, setPaused, phase, setPhase };
}
