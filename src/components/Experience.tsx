"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type CSSProperties } from "react";
import Landing from "./landing/Landing";

const loadDevice = () => import("./device/DeviceOS");
const DeviceOS = dynamic(loadDevice, {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center font-pixel tracking-[0.3em] text-holo">COSMO</div>,
});

type View = "landing" | "zoom" | "device";

/**
 * One continuous experience: the space scene, then a zoom through the
 * astronaut's wrist hologram into the device screen. /cosmo opens straight on
 * the device; the browser back button zooms back out to the scene.
 */
export default function Experience({ initial }: { initial: "landing" | "device" }) {
  const [view, setView] = useState<View>(initial);
  const [origin, setOrigin] = useState({ x: "70%", y: "35%" });

  useEffect(() => {
    const idle = setTimeout(loadDevice, 1200); // fetch the device code while the visitor reads
    const onPop = () => setView(location.pathname.startsWith("/cosmo") ? "device" : "landing");
    window.addEventListener("popstate", onPop);
    return () => { clearTimeout(idle); window.removeEventListener("popstate", onPop); };
  }, []);

  const open = (o: { x: number; y: number }) => {
    setOrigin({ x: `${o.x}px`, y: `${o.y + window.scrollY}px` });
    setView("zoom");
    setTimeout(() => {
      window.scrollTo(0, 0);
      setOrigin({ x: `${o.x}px`, y: `${o.y}px` });
      setView("device");
      history.pushState(null, "", "/cosmo");
    }, 1000);
  };

  const exit = () => {
    setView("landing");
    history.pushState(null, "", "/");
  };

  return (
    <div style={{ "--zx": origin.x, "--zy": origin.y } as CSSProperties}>
      {view !== "device" && (
        <div className={`zoom-stage ${view === "zoom" ? "is-zooming" : ""}`}>
          <Landing onOpen={open} zooming={view === "zoom"} />
        </div>
      )}
      {view === "zoom" && <div className="zoom-flash pointer-events-none fixed inset-0 z-50" aria-hidden />}
      {view === "device" && (
        <div className="device-enter">
          <DeviceOS onExit={exit} />
        </div>
      )}
    </div>
  );
}
