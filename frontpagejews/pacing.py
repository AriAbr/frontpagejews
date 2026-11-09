"""Spaces out calls to an API, to stay within its rate limit."""

import time


class Pacer:
    """Keeps calls at least `seconds` apart: `wait()` before each one."""

    def __init__(self, seconds):
        self.seconds = seconds
        self.last_call_at = 0.0

    def wait(self):
        time.sleep(max(0.0, self.last_call_at + self.seconds - time.monotonic()))
        self.last_call_at = time.monotonic()
