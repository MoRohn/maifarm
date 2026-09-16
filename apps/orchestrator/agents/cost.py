"""Cost calculation for Claude API usage."""
from __future__ import annotations

# Model pricing per 1M tokens (as of 2025-01-01)
MODEL_PRICING = {
    "claude-3-opus-20240229": {
        "input": 15.00,   # $15 per 1M input tokens
        "output": 75.00,  # $75 per 1M output tokens
    },
    "claude-3-sonnet-20240229": {
        "input": 3.00,    # $3 per 1M input tokens
        "output": 15.00,  # $15 per 1M output tokens
    },
    "claude-3-haiku-20240307": {
        "input": 0.25,    # $0.25 per 1M input tokens
        "output": 1.25,   # $1.25 per 1M output tokens
    },
    # Default fallback (use Sonnet pricing)
    "default": {
        "input": 3.00,
        "output": 15.00,
    }
}


def calculate_cost(model: str, tokens_in: int, tokens_out: int) -> float:
    """Calculate cost in USD for given token usage.

    Args:
        model: Model name (e.g., "claude-3-opus-20240229")
        tokens_in: Number of input tokens
        tokens_out: Number of output tokens

    Returns:
        Total cost in USD
    """
    pricing = MODEL_PRICING.get(model, MODEL_PRICING["default"])

    # Cost = (tokens / 1M) * price_per_1M
    input_cost = (tokens_in / 1_000_000) * pricing["input"]
    output_cost = (tokens_out / 1_000_000) * pricing["output"]

    return input_cost + output_cost


def get_model_pricing(model: str) -> dict[str, float]:
    """Get pricing info for a model.

    Args:
        model: Model name

    Returns:
        Dict with "input" and "output" prices per 1M tokens
    """
    return MODEL_PRICING.get(model, MODEL_PRICING["default"])
