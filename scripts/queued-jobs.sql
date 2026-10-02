SELECT id, status, "sourceSizeBytes", "durationSeconds", "originalVideoKey"
FROM "ReconstructionJob"
WHERE status = 'QUEUED'
ORDER BY "createdAt" DESC;
