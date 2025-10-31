"""Test XenoSync merge strategies for text, JSON, and binary files."""
from pathlib import Path

import pytest

from apps.orchestrator.xenosync.merge import (
    BinaryMergeStrategy,
    JsonMergeStrategy,
    TextMergeStrategy,
    auto_merge,
)


@pytest.mark.asyncio
async def test_text_merge_no_conflict() -> None:
    """Text 3-way merge with no conflicts."""
    base = b"line1\nline2\nline3\n"
    ours = b"line1\nline2_modified\nline3\n"
    theirs = b"line1\nline2\nline3_modified\n"

    result = await TextMergeStrategy.merge(base, ours, theirs)
    assert result.strategy == "text_3way_merge"
    assert b"line2_modified" in result.content
    assert b"line3_modified" in result.content
    assert not result.conflict


@pytest.mark.asyncio
async def test_text_merge_with_conflict() -> None:
    """Text 3-way merge with conflicts produces markers."""
    base = b"line1\nline2\nline3\n"
    ours = b"line1\nline2_ours\nline3\n"
    theirs = b"line1\nline2_theirs\nline3\n"

    result = await TextMergeStrategy.merge(base, ours, theirs)
    assert result.strategy == "text_3way_merge"
    assert b"<<<<<<< ours" in result.content
    assert b"=======" in result.content
    assert b">>>>>>> theirs" in result.content
    assert result.conflict
    assert len(result.warnings) > 0


@pytest.mark.asyncio
async def test_json_dict_merge() -> None:
    """JSON dict merge with order-insensitive handling."""
    base = b'{"a": 1, "b": 2, "c": 3}'
    ours = b'{"a": 1, "b": 99, "c": 3}'  # Changed b
    theirs = b'{"a": 1, "b": 2, "c": 88}'  # Changed c

    result = await JsonMergeStrategy.merge(base, ours, theirs)
    assert result.strategy == "json_dict_merge"
    assert b'"b": 99' in result.content  # Our change to b
    assert b'"c": 88' in result.content  # Their change to c


@pytest.mark.asyncio
async def test_json_array_last_writer() -> None:
    """JSON arrays use last-writer-wins with warning."""
    base = b'[1, 2, 3]'
    ours = b'[1, 2, 3, 4]'
    theirs = b'[1, 2, 3, 5]'

    result = await JsonMergeStrategy.merge(base, ours, theirs)
    assert result.strategy == "json_array_lastwriter"
    assert "arrays use last-writer-wins" in result.warnings[0]
    assert result.conflict
    assert result.content == theirs


@pytest.mark.asyncio
async def test_binary_last_writer() -> None:
    """Binary merge is always last-writer-wins."""
    base = b"\x00\x01\x02"
    ours = b"\x00\x01\x03"
    theirs = b"\x00\x01\x04"

    result = await BinaryMergeStrategy.merge(base, ours, theirs)
    assert result.strategy == "binary_lastwriter"
    assert "Binary file: using last-writer-wins" in result.warnings[0]
    assert result.conflict
    assert result.content == theirs


@pytest.mark.asyncio
async def test_auto_merge_selects_json() -> None:
    """auto_merge selects JSON strategy for .json files."""
    path = Path("test.json")
    base = b'{"key": "base"}'
    ours = b'{"key": "ours"}'
    theirs = b'{"key": "theirs"}'

    result = await auto_merge(path, base, ours, theirs)
    assert "json" in result.strategy


@pytest.mark.asyncio
async def test_auto_merge_selects_text() -> None:
    """auto_merge selects text strategy for .py files."""
    path = Path("test.py")
    base = b"# base\ncode = 1\n"
    ours = b"# ours\ncode = 1\n"
    theirs = b"# theirs\ncode = 1\n"

    result = await auto_merge(path, base, ours, theirs)
    assert "text" in result.strategy
