"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type CSSProperties } from "react";
import Landing from "./landing/Landing";

const loadDevice = () => import("./device/DeviceOS");
const DeviceOS = dynamic(loadDevice, { ssr: false, loading: () => null });

/** Warm everything the device needs while the visitor is still on the landing page. */
function preloadDevice() {
  loadDevice();
  import("./device/HoloBody");
  fetch("/models/body.bin");
  fetch("/models/body.json");
}

type View = "landing" | "zoom" | "device";
const ZOOM_MS = 850;

/**
 * One continuous experience: the space scene, then a zoom through the
 * astronaut's wrist hologram into the device screen. The device mounts the
 * moment the hologram is pressed (hidden under the zoom), so its WebGL setup
 * overlaps the animation instead of following it. Both layers only animate
 * transform and opacity, which the compositor runs off the main thread.
 */
export default function Experience({ initial }: { initial: "landing" | "device" }) {
  const [view, setView] = useState<View>(initial);
  const [origin, setOrigin] = useState({ x: "70%", y: "35%" });

  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const idle = w.requestIdleCallback ? w.requestIdleCallback(preloadDevice) : window.setTimeout(preloadDevice, 900);
    const onPop = () => setView(location.pathname.startsWith("/cosmo") ? "device" : "landing");
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!w.requestIdleCallback) clearTimeout(idle);
    };
  }, []);

  const open = (o: { x: number; y: number }) => {
    setOrigin({ x: `${o.x}px`, y: `${o.y + window.scrollY}px` });
    setView("zoom");
    history.pushState(null, "", "/cosmo");
    setTimeout(() => {
      window.scrollTo(0, 0);
      setView("device");
    }, ZOOM_MS);
  };

  const exit = () => {
    setView("landing");
    history.pushState(null, "", "/");
  };

  const deviceMounted = view !== "landing";
  return (
    <div style={{ "--zx": origin.x, "--zy": origin.y } as CSSProperties}>
      {view !== "device" && (
        <div className={`zoom-stage ${view === "zoom" ? "is-zooming" : ""}`}>
          <Landing onOpen={open} zooming={view === "zoom"} />
        </div>
      )}
      {deviceMounted && (
        <div className={`device-layer ${view === "device" ? "is-shown" : ""}`} aria-hidden={view !== "device"}>
          <DeviceOS onExit={exit} />
        </div>
      )}
    </div>
  );
}
