SELECT id, status, "videoObjectKey", "errorMessage"
FROM "Project"
WHERE id LIKE '93bf%' OR status = 'QUEUED'
ORDER BY "createdAt" DESC
LIMIT 5;
