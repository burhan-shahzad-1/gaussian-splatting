SELECT id, status, "originalVideoKey", "originalVideoUrl", "sourceSizeBytes", "durationSeconds"
FROM "ReconstructionJob"
WHERE id IN (
  '93bfaf36-0aa3-4a84-afb0-d3ec9e3d741b',
  'cb8582de-e060-47d5-88a9-a21edc129526',
  '0f4fe97f-ce4e-4a56-97ae-bd9041554150'
);
