export default function Loading() {
  return (
    <div className="viewer-shell">
      <div className="viewer-state" role="status">
        <span className="loading-arc" aria-hidden="true" />
        <p className="type-mono">Opening viewer</p>
      </div>
    </div>
  );
}
