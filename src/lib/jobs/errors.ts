export class JobNotFoundError extends Error {
  constructor(id: string) {
    super(`Reconstruction ${id} was not found.`);
    this.name = "JobNotFoundError";
  }
}

export class JobConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "JobConflictError";
  }
}

export class WorkerAuthError extends Error {
  constructor(message = "Worker authentication failed.") {
    super(message);
    this.name = "WorkerAuthError";
  }
}

export class DatabaseNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set. Start Postgres and add it to .env.local.");
    this.name = "DatabaseNotConfiguredError";
  }
}
