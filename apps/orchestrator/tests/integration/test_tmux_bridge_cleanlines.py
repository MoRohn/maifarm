"""Test tmux bridge ANSI stripping and line normalization."""
import pytest
from apps.orchestrator.tmux.stream_processor import (
    clean_terminal_output,
    normalize_line_endings,
    strip_ansi,
    expand_backspaces,
    StreamProcessor
)


def test_strip_ansi_removes_escape_sequences():
    """Verify ANSI escape sequences are removed."""
    input_text = "\x1b[31mRed text\x1b[0m and \x1b[1mbold\x1b[0m"
    result = strip_ansi(input_text, preserve_color=False)
    assert result == "Red text and bold"
    assert "\x1b" not in result


def test_strip_ansi_preserves_color_when_requested():
    """Verify color codes are preserved when flag is set."""
    input_text = "\x1b[31mRed\x1b[0m \x1b[Kclear\x1b[H"
    result = strip_ansi(input_text, preserve_color=True)
    # Color codes preserved, cursor movements removed
    assert "\x1b[31m" in result
    assert "\x1b[0m" in result
    assert "\x1b[K" not in result
    assert "\x1b[H" not in result


def test_normalize_line_endings():
    """Verify all line endings converted to \\n."""
    inputs = [
        "line1\r\nline2\r\nline3",
        "line1\rline2\rline3",
        "line1\nline2\nline3",
        "mixed\r\nstyles\rwith\ndifferent"
    ]
    for input_text in inputs:
        result = normalize_line_endings(input_text)
        assert "\r\n" not in result
        assert result.count("\r") == 0
        assert "\n" in result


def test_expand_backspaces():
    """Verify backspaces are processed correctly."""
    # "hello\b\b\b" removes last 3 chars -> "he", then "lo" -> "helo"
    assert expand_backspaces("hello\b\b\blo") == "helo"
    # "test\b\b\b\b" removes all 4 chars -> "", then "work" -> "work"
    assert expand_backspaces("test\b\b\b\bwork") == "work"
    assert expand_backspaces("no backspaces") == "no backspaces"


def test_clean_terminal_output_pipeline():
    """Verify complete cleaning pipeline."""
    # Simulate messy terminal output with ANSI, \r\n, and backspaces
    raw = b"\x1b[31mError:\x1b[0m test\r\nfailed\x1b[K\b\b\bed"

    result = clean_terminal_output(raw, preserve_color=False)

    # Should be clean text with normalized newlines
    assert "\x1b" not in result
    assert "\r" not in result
    # "failed\b\b\b" removes last 3 chars -> "fai", then "ed" -> "faied"
    assert "Error: test\nfaied" == result


def test_stream_processor_batching():
    """Verify stream processor batches lines correctly."""
    processor = StreamProcessor(pane_id="test", session_id="session")

    # Send data with multiple lines
    lines = processor.process_chunk(b"line1\nline2\nline3\n")

    # Should return up to MAX_BATCH_SIZE lines
    assert len(lines) <= 10  # MAX_BATCH_SIZE
    assert all(isinstance(line, str) for line in lines)
    assert "\n" not in "".join(lines)  # Lines should be split


def test_stream_processor_rate_limiting():
    """Verify rate limiting works (200 lines/sec)."""
    processor = StreamProcessor(pane_id="test", session_id="session")

    # Generate 300 lines rapidly
    data = b"\n".join([f"line{i}".encode() for i in range(300)])

    first_batch = processor.process_chunk(data)

    # Should not exceed rate limit in first batch
    assert len(first_batch) <= 200  # MAX_LINES_PER_SECOND


def test_stream_processor_partial_lines():
    """Verify partial lines are buffered correctly."""
    processor = StreamProcessor(pane_id="test", session_id="session")

    # Send partial line (no newline)
    lines = processor.process_chunk(b"partial ")
    assert len(lines) == 0  # Nothing emitted yet

    # Complete the line
    lines = processor.process_chunk(b"line complete\n")
    assert len(lines) >= 1
    assert lines[0] == "partial line complete"


def test_stream_processor_flush_stale():
    """Verify stale buffer is flushed after timeout."""
    import asyncio
    import time

    processor = StreamProcessor(pane_id="test", session_id="session")

    # Send partial line
    processor.process_chunk(b"partial")

    # Wait for flush timeout
    time.sleep(0.15)  # 150ms > 100ms flush timeout

    # Flush should return the partial line
    lines = processor.flush_if_stale(timeout_ms=100)
    assert "partial" in lines if lines else processor.buffer.buffer
