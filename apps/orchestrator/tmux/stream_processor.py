"""Terminal stream processor for cleaning and normalizing tmux output."""
from __future__ import annotations

import re
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

# ANSI escape sequence pattern
ANSI_ESCAPE_PATTERN = re.compile(r'\x1b\[[0-9;]*[mGKHJhlABCDEFfnsuSTi]|\x1b\][0-9];[^\x07]*\x07|\x1b[=>]')

# Color codes pattern (subset to preserve if needed)
ANSI_COLOR_PATTERN = re.compile(r'\x1b\[[0-9;]*m')


@dataclass
class StreamBuffer:
    """Per-pane buffer for handling partial lines and rate limiting."""

    pane_id: str
    session_id: str
    buffer: str = ""
    line_count: int = 0
    last_flush: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    lines_this_second: int = 0
    second_start: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    pending_lines: deque[str] = field(default_factory=deque)

    # Rate limiting: 200 lines/sec/pane
    MAX_LINES_PER_SECOND = 200
    # Batch up to 10 lines
    MAX_BATCH_SIZE = 10
    # Flush buffer after 100ms of no new data
    FLUSH_TIMEOUT_MS = 100


def strip_ansi(text: str, preserve_color: bool = False) -> str:
    """Remove ANSI escape sequences from text.

    Args:
        text: Input text with ANSI codes
        preserve_color: If True, keep color codes (e.g., \x1b[31m)

    Returns:
        Cleaned text
    """
    if preserve_color:
        # Remove all ANSI except color codes
        text = re.sub(r'\x1b\[[0-9;]*[GKHJhlABCDEFfnsuSTi]', '', text)
        text = re.sub(r'\x1b\][0-9];[^\x07]*\x07', '', text)
        text = re.sub(r'\x1b[=>]', '', text)
        return text
    else:
        # Remove all ANSI codes
        return ANSI_ESCAPE_PATTERN.sub('', text)


def normalize_line_endings(text: str) -> str:
    """Convert all line endings to \\n.

    Args:
        text: Input text with mixed line endings

    Returns:
        Text with normalized \\n line endings
    """
    # Convert \r\n and \r to \n
    text = text.replace('\r\n', '\n')
    text = text.replace('\r', '\n')
    return text


def expand_backspaces(text: str) -> str:
    """Process backspace characters to simulate terminal behavior.

    Args:
        text: Input text with backspaces

    Returns:
        Text with backspaces processed
    """
    result: list[str] = []
    for char in text:
        if char == '\b':
            if result:
                result.pop()
        else:
            result.append(char)
    return ''.join(result)


def decode_bytes_safe(data: bytes) -> str:
    """Decode bytes to UTF-8 with error replacement.

    Args:
        data: Raw bytes from PTY/tmux

    Returns:
        Decoded string with invalid sequences replaced
    """
    return data.decode('utf-8', errors='replace')


def clean_terminal_output(
    data: bytes,
    preserve_color: bool = False,
    expand_bs: bool = True
) -> str:
    """Complete pipeline for cleaning terminal output.

    Args:
        data: Raw bytes from terminal
        preserve_color: Keep ANSI color codes
        expand_bs: Process backspace characters

    Returns:
        Clean, normalized text
    """
    # 1. Decode with error replacement
    text = decode_bytes_safe(data)

    # 2. Normalize line endings
    text = normalize_line_endings(text)

    # 3. Strip ANSI (optionally preserve color)
    text = strip_ansi(text, preserve_color=preserve_color)

    # 4. Expand backspaces
    if expand_bs:
        text = expand_backspaces(text)

    return text


class StreamProcessor:
    """Process and emit terminal stream with rate limiting and batching."""

    def __init__(
        self,
        pane_id: str,
        session_id: str,
        preserve_color: bool = False
    ) -> None:
        self.buffer = StreamBuffer(pane_id=pane_id, session_id=session_id)
        self.preserve_color = preserve_color

    def process_chunk(self, data: bytes) -> list[str]:
        """Process incoming data chunk and return complete lines ready to emit.

        Args:
            data: Raw bytes from terminal

        Returns:
            List of complete, clean lines ready to emit
        """
        # Clean the data
        text = clean_terminal_output(data, preserve_color=self.preserve_color)

        # Add to buffer
        self.buffer.buffer += text

        # Extract complete lines
        lines = []
        while '\n' in self.buffer.buffer:
            line, self.buffer.buffer = self.buffer.buffer.split('\n', 1)
            line = line.strip()
            if line:  # Skip empty lines
                lines.append(line)

        # Apply rate limiting
        now = datetime.now(timezone.utc)
        if (now - self.buffer.second_start).total_seconds() >= 1.0:
            # Reset counter every second
            self.buffer.second_start = now
            self.buffer.lines_this_second = 0

        # Add to pending queue
        for line in lines:
            self.buffer.pending_lines.append(line)

        # Return batch if ready
        return self._get_batch_if_ready()

    def _get_batch_if_ready(self) -> list[str]:
        """Get a batch of lines if rate limit allows.

        Returns:
            List of lines to emit (up to MAX_BATCH_SIZE)
        """
        now = datetime.now(timezone.utc)

        # Check if we can send more this second
        if self.buffer.lines_this_second >= StreamBuffer.MAX_LINES_PER_SECOND:
            return []

        # Get up to MAX_BATCH_SIZE lines
        batch: list[str] = []
        while (
            self.buffer.pending_lines
            and len(batch) < StreamBuffer.MAX_BATCH_SIZE
            and self.buffer.lines_this_second < StreamBuffer.MAX_LINES_PER_SECOND
        ):
            batch.append(self.buffer.pending_lines.popleft())
            self.buffer.lines_this_second += 1

        if batch:
            self.buffer.last_flush = now

        return batch

    def flush_if_stale(self, timeout_ms: int = 100) -> list[str]:
        """Flush buffer if data is stale.

        Args:
            timeout_ms: Flush if no new data for this many milliseconds

        Returns:
            List of lines to emit
        """
        now = datetime.now(timezone.utc)
        ms_since_flush = (now - self.buffer.last_flush).total_seconds() * 1000

        if ms_since_flush >= timeout_ms and self.buffer.buffer.strip():
            # Flush remaining buffer as a line
            line = self.buffer.buffer.strip()
            self.buffer.buffer = ""
            if line:
                self.buffer.pending_lines.append(line)

        return self._get_batch_if_ready()

    def get_stats(self) -> dict[str, Any]:
        """Get processor statistics.

        Returns:
            Dict with buffer state and stats
        """
        return {
            "pane_id": self.buffer.pane_id,
            "session_id": self.buffer.session_id,
            "buffer_size": len(self.buffer.buffer),
            "pending_lines": len(self.buffer.pending_lines),
            "lines_this_second": self.buffer.lines_this_second,
            "total_lines": self.buffer.line_count
        }
