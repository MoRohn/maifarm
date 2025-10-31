"""Lightweight Prometheus client fallback for offline environments."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, TypeVar

CONTENT_TYPE_LATEST = "text/plain; version=0.0.4; charset=utf-8"


@dataclass
class _Sample:
    name: str
    value: float
    labels: Dict[str, str] = field(default_factory=dict)


TMetric = TypeVar("TMetric", bound="_Metric")


class _Metric:
    def __init__(self, name: str, documentation: str, label_names: List[str] | None = None) -> None:
        self.name = name
        self.documentation = documentation
        self._label_names = label_names or []
        self._samples: Dict[tuple[tuple[str, str], ...], _Sample] = {}
        self._current_labels: Dict[str, str] | None = None
        _REGISTRY.append(self)

    def _key(self, labels: Dict[str, str] | None) -> tuple[tuple[str, str], ...]:
        labels = labels or {}
        missing = set(self._label_names) - set(labels.keys())
        if missing:
            raise ValueError(f"Missing labels: {', '.join(sorted(missing))}")
        extras = set(labels.keys()) - set(self._label_names)
        if extras:
            raise ValueError(f"Unexpected labels: {', '.join(sorted(extras))}")
        return tuple(sorted(labels.items()))

    def _get_sample(self, labels: Dict[str, str] | None) -> _Sample:
        key = self._key(labels)
        if key not in self._samples:
            self._samples[key] = _Sample(name=self.name, value=0.0, labels=dict(key))
        return self._samples[key]

    def labels(self: TMetric, **labels: str) -> TMetric:
        self._current_labels = labels
        return self

    # Default no-op, subclasses override
    def observe(self, value: float) -> None:  # pragma: no cover - interface placeholder
        raise NotImplementedError


class Gauge(_Metric):
    def set(self, value: float) -> None:
        sample = self._get_sample(getattr(self, "_current_labels", None))
        sample.value = float(value)


class Counter(_Metric):
    def inc(self, amount: float = 1.0) -> None:
        sample = self._get_sample(getattr(self, "_current_labels", None))
        sample.value += float(amount)


class Histogram(_Metric):
    def __init__(self, name: str, documentation: str, label_names: List[str] | None = None) -> None:
        super().__init__(name, documentation, label_names)
        self._observations: List[float] = []

    def observe(self, value: float) -> None:
        sample = self._get_sample(getattr(self, "_current_labels", None))
        sample.value = float(value)
        self._observations.append(float(value))


_REGISTRY: List[_Metric] = []


def generate_latest() -> bytes:
    lines: List[str] = []
    for metric in _REGISTRY:
        lines.append(f"# HELP {metric.name} {metric.documentation}")
        lines.append(f"# TYPE {metric.name} gauge")
        for sample in metric._samples.values():  # noqa: SLF001
            if sample.labels:
                label_str = ",".join(f'{k}="{v}"' for k, v in sample.labels.items())
                lines.append(f"{metric.name}{{{label_str}}} {sample.value}")
            else:
                lines.append(f"{metric.name} {sample.value}")
    return ("\n".join(lines) + "\n").encode()
