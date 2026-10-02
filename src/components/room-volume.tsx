"use client";

import { useRef, type MouseEvent } from "react";

export function RoomVolume({ caption }: { caption?: string }) {
  const stageRef = useRef<HTMLDivElement>(null);

  function onMove(event: MouseEvent<HTMLDivElement>) {
    const node = stageRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    node.style.setProperty("--tilt-x", `${y * -7}deg`);
    node.style.setProperty("--tilt-y", `${x * 9}deg`);
  }

  function onLeave() {
    const node = stageRef.current;
    if (!node) return;
    node.style.setProperty("--tilt-x", "0deg");
    node.style.setProperty("--tilt-y", "0deg");
  }

  return (
    <div className="grid justify-items-center">
      <div
        ref={stageRef}
        className="room-stage grid min-h-[260px] w-full place-items-center sm:min-h-[320px]"
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        <div className="room-volume">
          <div className="room-volume-face" />
          <div className="room-volume-glow" />
        </div>
      </div>
      {caption ? <p className="type-mono">{caption}</p> : null}
    </div>
  );
}
