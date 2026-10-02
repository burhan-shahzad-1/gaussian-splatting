UPDATE "ReconstructionJob"
SET status = 'QUEUED',
    progress = 8,
    error = NULL,
    "claimedAt" = NULL,
    "startedAt" = NULL,
    "completedAt" = NULL
WHERE id = '93bfaf36-0aa3-4a84-afb0-d3ec9e3d741b';

SELECT id, status, progress, error FROM "ReconstructionJob" WHERE id = '93bfaf36-0aa3-4a84-afb0-d3ec9e3d741b';
