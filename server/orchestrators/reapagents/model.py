"""
ReapAgents Model Configuration
Support for multiple AI providers: Claude, OpenAI, Qwen, Ollama
"""

import os
import logging
from typing import Any, Optional, Dict

logger = logging.getLogger("reapagents.model")

# Try to import LangChain model classes
try:
    from langchain_anthropic import ChatAnthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    ChatAnthropic = None

try:
    from langchain_openai import ChatOpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    ChatOpenAI = None

try:
    from langchain_community.llms import Ollama
    OLLAMA_AVAILABLE = True
except ImportError:
    OLLAMA_AVAILABLE = False
    Ollama = None

# Model configurations by provider
MODEL_CONFIGS = {
    "claude": {
        "default_model": "claude-3-5-sonnet-20241022",
        "models": {
            "claude-3-5-sonnet-20241022": {"max_tokens": 8192, "temperature": 0.7},
            "claude-3-opus-20240229": {"max_tokens": 4096, "temperature": 0.7},
            "claude-3-sonnet-20240229": {"max_tokens": 4096, "temperature": 0.7},
            "claude-3-haiku-20240307": {"max_tokens": 4096, "temperature": 0.7}
        }
    },
    "openai": {
        "default_model": "gpt-4-turbo-preview",
        "models": {
            "gpt-4-turbo-preview": {"max_tokens": 128000, "temperature": 0.7},
            "gpt-4": {"max_tokens": 8192, "temperature": 0.7},
            "gpt-4-32k": {"max_tokens": 32768, "temperature": 0.7},
            "gpt-3.5-turbo": {"max_tokens": 16385, "temperature": 0.7},
            "gpt-3.5-turbo-16k": {"max_tokens": 16385, "temperature": 0.7}
        }
    },
    "qwen": {
        "default_model": "qwen-coder-480b",
        "models": {
            "qwen-coder-480b": {"max_tokens": 256000, "temperature": 0.7},
            "qwen2.5-coder:32b": {"max_tokens": 32768, "temperature": 0.7},
            "qwen2.5-coder:7b": {"max_tokens": 8192, "temperature": 0.7}
        }
    },
    "ollama": {
        "default_model": "qwen2.5-coder:7b",
        "models": {
            "qwen2.5-coder:7b": {"temperature": 0.7},
            "qwen2.5-coder:32b": {"temperature": 0.7},
            "codellama:13b": {"temperature": 0.7},
            "deepseek-coder:6.7b": {"temperature": 0.7},
            "mistral:7b": {"temperature": 0.7}
        }
    }
}

def get_api_key(provider: str) -> Optional[str]:
    """
    Get API key for the provider from environment
    
    Args:
        provider: The AI provider name
    
    Returns:
        API key or None if not found
    """
    key_mapping = {
        "claude": "ANTHROPIC_API_KEY",
        "openai": "OPENAI_API_KEY",
        "qwen": "QWEN_API_KEY",
        "ollama": None  # Ollama doesn't need API key for local models
    }
    
    env_var = key_mapping.get(provider)
    if env_var:
        return os.environ.get(env_var)
    return None

def get_model_for_provider(
    provider: str,
    model_name: Optional[str] = None,
    **kwargs
) -> Any:
    """
    Get a configured model for the specified provider
    
    Args:
        provider: The AI provider (claude, openai, qwen, ollama)
        model_name: Specific model to use (or default for provider)
        **kwargs: Additional model configuration
    
    Returns:
        Configured language model
    
    Raises:
        ValueError: If provider is not supported or dependencies missing
    """
    
    provider = provider.lower()
    
    if provider not in MODEL_CONFIGS:
        raise ValueError(f"Unsupported provider: {provider}. Supported: {list(MODEL_CONFIGS.keys())}")
    
    config = MODEL_CONFIGS[provider]
    
    # Use default model if not specified
    if model_name is None:
        model_name = config["default_model"]
    
    # Get model-specific config
    model_config = config["models"].get(model_name, {})
    
    # Merge with provided kwargs
    final_config = {**model_config, **kwargs}
    
    logger.info(f"Creating model for provider={provider}, model={model_name}")
    
    try:
        if provider == "claude":
            if not ANTHROPIC_AVAILABLE:
                raise ImportError("langchain-anthropic required. Install with: pip install langchain-anthropic")
            
            api_key = get_api_key("claude")
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY environment variable not set")
            
            return ChatAnthropic(
                model=model_name,
                anthropic_api_key=api_key,
                **final_config
            )
        
        elif provider == "openai":
            if not OPENAI_AVAILABLE:
                raise ImportError("langchain-openai required. Install with: pip install langchain-openai")
            
            api_key = get_api_key("openai")
            if not api_key:
                raise ValueError("OPENAI_API_KEY environment variable not set")
            
            return ChatOpenAI(
                model=model_name,
                openai_api_key=api_key,
                **final_config
            )
        
        elif provider == "qwen":
            # Qwen can use either DashScope API or Ollama for local
            use_local = os.environ.get("QWEN_USE_LOCAL", "false").lower() == "true"
            
            if use_local:
                # Use Ollama for local Qwen models
                if not OLLAMA_AVAILABLE:
                    raise ImportError("langchain-community required. Install with: pip install langchain-community")
                
                ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
                return Ollama(
                    model=model_name,
                    base_url=ollama_host,
                    **final_config
                )
            else:
                # Use DashScope API (would need custom implementation)
                # For now, fallback to OpenAI-compatible interface
                if not OPENAI_AVAILABLE:
                    raise ImportError("langchain-openai required. Install with: pip install langchain-openai")
                
                api_key = get_api_key("qwen")
                if not api_key:
                    raise ValueError("QWEN_API_KEY environment variable not set")
                
                # DashScope uses OpenAI-compatible API
                return ChatOpenAI(
                    model=model_name,
                    openai_api_key=api_key,
                    openai_api_base="https://dashscope.aliyuncs.com/compatible-mode/v1",
                    **final_config
                )
        
        elif provider == "ollama":
            if not OLLAMA_AVAILABLE:
                raise ImportError("langchain-community required. Install with: pip install langchain-community")
            
            ollama_host = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
            
            return Ollama(
                model=model_name,
                base_url=ollama_host,
                **final_config
            )
        
    except Exception as e:
        logger.error(f"Failed to create model for {provider}: {str(e)}")
        raise

def get_default_model():
    """
    Get the default model based on environment configuration
    
    Returns:
        Configured default model
    """
    # Check which provider is configured
    provider = os.environ.get("AI_PROVIDER", "claude").lower()
    
    # Try to get model for the configured provider
    try:
        return get_model_for_provider(provider)
    except Exception as e:
        logger.warning(f"Failed to get model for {provider}: {str(e)}")
        
        # Try fallback providers
        fallback_order = ["claude", "openai", "ollama"]
        for fallback in fallback_order:
            if fallback != provider:
                try:
                    logger.info(f"Trying fallback provider: {fallback}")
                    return get_model_for_provider(fallback)
                except Exception:
                    continue
        
        raise ValueError("No AI provider could be configured. Please check your environment variables.")

class ModelManager:
    """
    Manages model instances and configurations
    """
    
    def __init__(self):
        self.models: Dict[str, Any] = {}
        self.default_provider = os.environ.get("AI_PROVIDER", "claude").lower()
    
    def get_model(
        self,
        provider: Optional[str] = None,
        model_name: Optional[str] = None,
        cache_key: Optional[str] = None,
        **kwargs
    ) -> Any:
        """
        Get or create a model instance
        
        Args:
            provider: AI provider to use
            model_name: Specific model name
            cache_key: Key for caching the model instance
            **kwargs: Additional model configuration
        
        Returns:
            Model instance
        """
        if provider is None:
            provider = self.default_provider
        
        # Generate cache key if not provided
        if cache_key is None:
            cache_key = f"{provider}:{model_name or 'default'}"
        
        # Return cached model if available
        if cache_key in self.models:
            return self.models[cache_key]
        
        # Create new model
        model = get_model_for_provider(provider, model_name, **kwargs)
        
        # Cache the model
        self.models[cache_key] = model
        
        return model
    
    def clear_cache(self):
        """Clear all cached models"""
        self.models.clear()
    
    def set_default_provider(self, provider: str):
        """Set the default provider"""
        if provider not in MODEL_CONFIGS:
            raise ValueError(f"Unknown provider: {provider}")
        self.default_provider = provider

# Global model manager instance
model_manager = ModelManager()