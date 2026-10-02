class PipelineError(RuntimeError):
    """A processing stage failed. recoverable=True means a recapture or requeue can succeed."""

    def __init__(self, stage: str, message: str, *, recoverable: bool = True) -> None:
        super().__init__(f"[{stage}] {message}")
        self.stage = stage
        self.recoverable = recoverable


class CudaOomError(PipelineError):
    def __init__(self, stage: str, detail: str = "") -> None:
        message = (
            "GPU ran out of memory during draft reconstruction. "
            "Use a shorter walkthrough, or lower FRAME_MAX_COUNT / FRAME_MAX_WIDTH."
        )
        if detail:
            message = f"{message} ({detail})"
        super().__init__(stage, message, recoverable=True)
