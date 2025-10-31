"""Minimal structlog-compatible facade for offline testing."""
from __future__ import annotations

from typing import Any, Callable


class _Processors:
    @staticmethod
    def TimeStamper(fmt: str = "iso") -> Callable[[Any, str, dict[str, Any]], dict[str, Any]]:
        def stamper(logger: Any, method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
            event_dict.setdefault("timestamp", "0")
            return event_dict

        return stamper

    @staticmethod
    def StackInfoRenderer() -> Callable[[Any, str, dict[str, Any]], dict[str, Any]]:
        def renderer(logger: Any, method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
            return event_dict

        return renderer

    @staticmethod
    def format_exc_info(logger: Any, method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
        return event_dict

    @staticmethod
    def JSONRenderer() -> Callable[[Any, str, dict[str, Any]], str]:
        def renderer(logger: Any, method_name: str, event_dict: dict[str, Any]) -> str:
            items = " ".join(f"{k}={v}" for k, v in sorted(event_dict.items()))
            return items

        return renderer


class _StdLib:
    @staticmethod
    def add_log_level(logger: Any, method_name: str, event_dict: dict[str, Any]) -> dict[str, Any]:
        return event_dict


processors = _Processors()
stdlib = _StdLib()


class _Logger:
    def __init__(self, name: str) -> None:
        self._name = name

    def bind(self, **kwargs: Any) -> "_Logger":
        return self

    def _log(self, level: str, event: str, **kwargs: Any) -> None:
        message = {"level": level, "event": event, **kwargs}
        print(f"[{self._name}] {message}")

    def info(self, event: str, **kwargs: Any) -> None:
        self._log("info", event, **kwargs)

    def warning(self, event: str, **kwargs: Any) -> None:
        self._log("warning", event, **kwargs)

    def debug(self, event: str, **kwargs: Any) -> None:
        self._log("debug", event, **kwargs)

    def exception(self, event: str, **kwargs: Any) -> None:
        self._log("error", event, **kwargs)


def get_logger(name: str) -> _Logger:
    return _Logger(name)


BoundLogger = _Logger


def configure(*args: Any, **kwargs: Any) -> None:  # noqa: D401 - compatibility stub
    """No-op configuration stub."""
    return None


def make_filtering_bound_logger(level: int) -> Callable[[str], _Logger]:
    def factory(name: str) -> _Logger:
        return _Logger(name)

    return factory
