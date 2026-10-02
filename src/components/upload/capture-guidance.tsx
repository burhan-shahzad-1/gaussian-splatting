const GUIDANCE = [
  "Film whatever part of the room you need — a corner, a wall, or the whole space",
  "Move slowly and keep the camera as steady as you can",
  "Overlap what you already filmed so look-around stays continuous",
  "Avoid heavy motion blur and sudden snaps",
  "360 is welcome, but not required",
];

export function CaptureGuidance() {
  return (
    <aside className="glass rounded-[var(--radius-md)] px-6 py-6 sm:px-7 lg:sticky lg:top-28">
      <p className="type-mono">Before you record</p>
      <h2 className="type-heading mt-3">Capture guidance</h2>
      <ol className="mt-6 grid gap-4">
        {GUIDANCE.map((item, index) => (
          <li key={item} className="grid grid-cols-[2rem_1fr] items-baseline gap-3">
            <span className="type-mono">0{index + 1}</span>
            <span className="type-caption">{item}</span>
          </li>
        ))}
      </ol>
      <p className="type-caption mt-6">
        MP4 or MOV · under 4 GB. The viewer uses the actual frames from your
        clip, so a quarter-room capture still looks like that part of the room —
        sharp, not a reconstructed blob.
      </p>
    </aside>
  );
}
