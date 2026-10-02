class PipelineError(RuntimeError):
    """A processing stage failed. recoverable=True means a recapture or requeue can succeed."""

    def __init__(self, stage: str, message: str, *, recoverable: bool = True) -> None:
        super().__init__(f"[{stage}] {message}")
        self.stage = stage
        self.recoverable = recoverable
