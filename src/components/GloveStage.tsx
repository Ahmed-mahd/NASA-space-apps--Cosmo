"use client";

import dynamic from "next/dynamic";

const GloveScene = dynamic(() => import("./GloveScene"), {
  ssr: false,
  loading: () => <div className="h-full w-full grid place-items-center hud-label">Powering up emitter…</div>,
});

export default function GloveStage() {
  return <GloveScene />;
}
