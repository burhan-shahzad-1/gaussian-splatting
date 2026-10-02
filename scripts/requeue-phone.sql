UPDATE "ReconstructionJob"
SET status = 'FAILED', error = 'Skipped dummy queue item; processing phone walkthrough instead.'
WHERE status = 'QUEUED'
  AND id <> '93bfaf36-0aa3-4a84-afb0-d3ec9e3d741b';

UPDATE "ReconstructionJob"
SET status = 'QUEUED', progress = 0, error = NULL, "claimedAt" = NULL, "startedAt" = NULL
WHERE id = '93bfaf36-0aa3-4a84-afb0-d3ec9e3d741b';
