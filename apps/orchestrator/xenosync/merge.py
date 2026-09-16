"""Merge strategies for XenoSync concurrent file operations."""
from __future__ import annotations

import difflib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from ..observability.logging import get_logger

_logger = get_logger("xenosync.merge")


@dataclass
class MergeResult:
    """Result of a merge operation."""

    content: bytes
    warnings: list[str]
    strategy: str
    conflict: bool = False


class MergeStrategy:
    """Base class for merge strategies."""

    @staticmethod
    def can_merge(path: Path) -> bool:
        """Check if this strategy can handle the file type."""
        raise NotImplementedError

    @staticmethod
    async def merge(base: bytes, ours: bytes, theirs: bytes) -> MergeResult:
        """Perform a 3-way merge.

        Args:
            base: Original content before concurrent writes
            ours: Our modifications
            theirs: Their modifications

        Returns:
            MergeResult with merged content and warnings
        """
        raise NotImplementedError


class TextMergeStrategy(MergeStrategy):
    """3-way merge for text files using difflib."""

    @staticmethod
    def can_merge(path: Path) -> bool:
        """Text files have common extensions."""
        text_extensions = {".txt", ".md", ".py", ".js", ".ts", ".json", ".yaml", ".yml", ".html", ".css", ".xml"}
        return path.suffix.lower() in text_extensions

    @staticmethod
    async def merge(base: bytes, ours: bytes, theirs: bytes) -> MergeResult:
        """3-way text merge using difflib.

        Args:
            base: Original text
            ours: Our changes
            theirs: Their changes

        Returns:
            Merged text with conflict markers if needed
        """
        try:
            base_lines = base.decode("utf-8").splitlines(keepends=True)
            ours_lines = ours.decode("utf-8").splitlines(keepends=True)
            theirs_lines = theirs.decode("utf-8").splitlines(keepends=True)
        except UnicodeDecodeError:
            # Fall back to binary if decode fails
            return MergeResult(
                content=theirs,
                warnings=["Text decode failed, using last-writer-wins"],
                strategy="text_fallback_binary",
                conflict=True,
            )

        # Use difflib for 3-way merge
        base_to_ours = list(difflib.unified_diff(base_lines, ours_lines, lineterm=""))
        base_to_theirs = list(difflib.unified_diff(base_lines, theirs_lines, lineterm=""))

        # If no conflicts, merge cleanly
        if not base_to_ours:
            # We didn't change anything, use theirs
            return MergeResult(content=theirs, warnings=[], strategy="text_3way_theirs")

        if not base_to_theirs:
            # They didn't change anything, use ours
            return MergeResult(content=ours, warnings=[], strategy="text_3way_ours")

        # Both changed - attempt automatic merge
        # For simplicity, use a line-based merge with conflict markers
        merged_lines: list[str] = []
        warnings: list[str] = []
        conflict = False

        # Simple merge: if lines match or only one side changed, take that
        # If both changed differently, mark conflict
        max_len = max(len(base_lines), len(ours_lines), len(theirs_lines))
        for i in range(max_len):
            base_line = base_lines[i] if i < len(base_lines) else ""
            ours_line = ours_lines[i] if i < len(ours_lines) else ""
            theirs_line = theirs_lines[i] if i < len(theirs_lines) else ""

            if ours_line == theirs_line:
                # Both agree
                merged_lines.append(ours_line)
            elif ours_line == base_line:
                # Only theirs changed
                merged_lines.append(theirs_line)
            elif theirs_line == base_line:
                # Only ours changed
                merged_lines.append(ours_line)
            else:
                # Conflict
                conflict = True
                merged_lines.append("<<<<<<< ours\n")
                merged_lines.append(ours_line)
                merged_lines.append("=======\n")
                merged_lines.append(theirs_line)
                merged_lines.append(">>>>>>> theirs\n")
                warnings.append(f"Conflict at line {i + 1}")

        merged_content = "".join(merged_lines).encode("utf-8")
        return MergeResult(
            content=merged_content,
            warnings=warnings,
            strategy="text_3way_merge",
            conflict=conflict,
        )


class JsonMergeStrategy(MergeStrategy):
    """Order-insensitive JSON merge with array handling."""

    @staticmethod
    def can_merge(path: Path) -> bool:
        """JSON files."""
        return path.suffix.lower() == ".json"

    @staticmethod
    async def merge(base: bytes, ours: bytes, theirs: bytes) -> MergeResult:
        """Merge JSON objects order-independently.

        Args:
            base: Original JSON
            ours: Our changes
            theirs: Their changes

        Returns:
            Merged JSON or last-writer with warning
        """
        warnings: list[str] = []
        try:
            base_obj = json.loads(base.decode("utf-8"))
            ours_obj = json.loads(ours.decode("utf-8"))
            theirs_obj = json.loads(theirs.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            warnings.append(f"JSON parse failed: {exc}, using last-writer-wins")
            return MergeResult(
                content=theirs,
                warnings=warnings,
                strategy="json_fallback_binary",
                conflict=True,
            )

        # Merge logic for dicts
        if isinstance(base_obj, dict) and isinstance(ours_obj, dict) and isinstance(theirs_obj, dict):
            merged = _merge_dict(base_obj, ours_obj, theirs_obj, warnings)
            merged_bytes = json.dumps(merged, indent=2, ensure_ascii=False).encode("utf-8")
            return MergeResult(
                content=merged_bytes,
                warnings=warnings,
                strategy="json_dict_merge",
                conflict=bool(warnings),
            )

        # Arrays: last-writer-wins with warning
        if isinstance(base_obj, list) or isinstance(ours_obj, list) or isinstance(theirs_obj, list):
            warnings.append("JSON arrays use last-writer-wins")
            return MergeResult(content=theirs, warnings=warnings, strategy="json_array_lastwriter", conflict=True)

        # Scalars: last-writer-wins
        warnings.append("JSON scalars use last-writer-wins")
        return MergeResult(content=theirs, warnings=warnings, strategy="json_scalar_lastwriter", conflict=True)


def _merge_dict(base: dict[str, Any], ours: dict[str, Any], theirs: dict[str, Any], warnings: list[str]) -> dict[str, Any]:
    """Recursively merge dictionaries.

    Args:
        base: Original dict
        ours: Our changes
        theirs: Their changes
        warnings: List to append warnings to

    Returns:
        Merged dictionary
    """
    merged: dict[str, Any] = {}

    # Keys present in any version
    all_keys = set(base.keys()) | set(ours.keys()) | set(theirs.keys())

    for key in all_keys:
        base_val = base.get(key)
        ours_val = ours.get(key)
        theirs_val = theirs.get(key)

        # Key only in one version
        if key not in ours:
            # We deleted or never had it, use theirs
            if key in theirs:
                merged[key] = theirs_val
        elif key not in theirs:
            # They deleted or never had it, use ours
            merged[key] = ours_val
        elif ours_val == theirs_val:
            # Both agree
            merged[key] = ours_val
        elif ours_val == base_val:
            # Only theirs changed
            merged[key] = theirs_val
        elif theirs_val == base_val:
            # Only ours changed
            merged[key] = ours_val
        else:
            # Conflict - both changed differently
            if isinstance(ours_val, dict) and isinstance(theirs_val, dict):
                # Recurse
                merged[key] = _merge_dict(base_val if isinstance(base_val, dict) else {}, ours_val, theirs_val, warnings)
            else:
                # Last-writer-wins
                merged[key] = theirs_val
                warnings.append(f"Conflict on key '{key}': both changed, using theirs")

    return merged


class BinaryMergeStrategy(MergeStrategy):
    """Last-writer-wins for binary files."""

    @staticmethod
    def can_merge(path: Path) -> bool:
        """All files can fall back to binary."""
        return True

    @staticmethod
    async def merge(base: bytes, ours: bytes, theirs: bytes) -> MergeResult:
        """Binary merge is always last-writer-wins.

        Args:
            base: Original bytes
            ours: Our bytes
            theirs: Their bytes

        Returns:
            Their content with warning
        """
        warnings = ["Binary file: using last-writer-wins"]
        return MergeResult(content=theirs, warnings=warnings, strategy="binary_lastwriter", conflict=True)


async def auto_merge(path: Path, base: bytes, ours: bytes, theirs: bytes) -> MergeResult:
    """Automatically select and apply merge strategy.

    Args:
        path: File path to determine type
        base: Original content
        ours: Our modifications
        theirs: Their modifications

    Returns:
        MergeResult with merged content and warnings
    """
    # Try strategies in order
    strategies: list[type[MergeStrategy]] = [JsonMergeStrategy, TextMergeStrategy, BinaryMergeStrategy]

    for strategy_class in strategies:
        if strategy_class.can_merge(path):
            result = await strategy_class.merge(base, ours, theirs)
            _logger.info(
                "merge_completed",
                path=str(path),
                strategy=result.strategy,
                conflict=result.conflict,
                warnings=len(result.warnings),
            )
            return result

    # Should never reach here since BinaryMergeStrategy accepts all
    return await BinaryMergeStrategy.merge(base, ours, theirs)
