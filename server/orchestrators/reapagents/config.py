"""
ReapAgents Configuration
Central configuration management for ReapAgents
"""

import os
import json
import yaml
from pathlib import Path
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, field, asdict

@dataclass
class ReapConfig:
    """Configuration for ReapAgents orchestration"""
    
    # Farm configuration
    farm_id: str
    num_agents: int = 3
    provider: str = "claude"
    
    # Paths
    workspace_path: str = ""
    barn_path: str = ""
    coordination_path: str = ""
    harvest_path: str = ""
    
    # Execution settings
    timeout: int = 300000  # 5 minutes default
    collaborative: bool = True
    parallel_execution: bool = True
    max_iterations: int = 100
    
    # Agent settings
    enable_memory: bool = True
    enable_sub_agents: bool = True
    auto_harvest: bool = True
    debug: bool = False
    
    # Model settings
    model_name: Optional[str] = None
    temperature: float = 0.7
    max_tokens: Optional[int] = None
    
    # Sub-agent configuration
    sub_agents: List[str] = field(default_factory=lambda: [
        "code-architect",
        "code-implementer",
        "test-engineer",
        "documentation-writer",
        "security-auditor",
        "performance-optimizer",
        "harvest-collector",
        "coordinator"
    ])
    
    # Performance settings
    cache_models: bool = True
    batch_size: int = 5
    stagger_delay: float = 0.5
    
    # Monitoring
    metrics_enabled: bool = True
    log_level: str = "INFO"
    save_checkpoints: bool = True
    
    def __post_init__(self):
        """Initialize paths if not set"""
        base_path = Path(os.environ.get("MAIBARN_ROOT", "/tmp/maibarn"))
        
        if not self.workspace_path:
            self.workspace_path = str(base_path / "workspaces" / self.farm_id)
        
        if not self.barn_path:
            self.barn_path = str(base_path / "barn")
        
        if not self.coordination_path:
            self.coordination_path = str(base_path / "coordination")
        
        if not self.harvest_path:
            self.harvest_path = str(base_path / "harvests" / self.farm_id)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)
    
    def to_json(self) -> str:
        """Convert to JSON string"""
        return json.dumps(self.to_dict(), indent=2)
    
    def to_yaml(self) -> str:
        """Convert to YAML string"""
        return yaml.dump(self.to_dict(), default_flow_style=False)
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ReapConfig":
        """Create from dictionary"""
        return cls(**data)
    
    @classmethod
    def from_json(cls, json_str: str) -> "ReapConfig":
        """Create from JSON string"""
        return cls.from_dict(json.loads(json_str))
    
    @classmethod
    def from_yaml(cls, yaml_str: str) -> "ReapConfig":
        """Create from YAML string"""
        return cls.from_dict(yaml.load(yaml_str, Loader=yaml.SafeLoader))
    
    @classmethod
    def from_file(cls, file_path: str) -> "ReapConfig":
        """Load configuration from file"""
        path = Path(file_path)
        
        if not path.exists():
            raise FileNotFoundError(f"Config file not found: {file_path}")
        
        content = path.read_text()
        
        if path.suffix in [".yaml", ".yml"]:
            return cls.from_yaml(content)
        elif path.suffix == ".json":
            return cls.from_json(content)
        else:
            # Try to parse as YAML first, then JSON
            try:
                return cls.from_yaml(content)
            except:
                return cls.from_json(content)
    
    def save(self, file_path: str):
        """Save configuration to file"""
        path = Path(file_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        
        if path.suffix in [".yaml", ".yml"]:
            content = self.to_yaml()
        else:
            content = self.to_json()
        
        path.write_text(content)
    
    def validate(self) -> List[str]:
        """
        Validate configuration
        
        Returns:
            List of validation errors (empty if valid)
        """
        errors = []
        
        # Validate required fields
        if not self.farm_id:
            errors.append("farm_id is required")
        
        if self.num_agents < 1:
            errors.append("num_agents must be at least 1")
        
        if self.num_agents > 20:
            errors.append("num_agents should not exceed 20 for performance reasons")
        
        # Validate provider
        valid_providers = ["claude", "openai", "qwen", "ollama"]
        if self.provider not in valid_providers:
            errors.append(f"provider must be one of: {valid_providers}")
        
        # Validate timeout
        if self.timeout < 1000:
            errors.append("timeout must be at least 1000ms (1 second)")
        
        if self.timeout > 3600000:
            errors.append("timeout should not exceed 3600000ms (1 hour)")
        
        # Validate paths exist or can be created
        for path_name, path_value in [
            ("workspace_path", self.workspace_path),
            ("barn_path", self.barn_path),
            ("coordination_path", self.coordination_path),
            ("harvest_path", self.harvest_path)
        ]:
            path = Path(path_value)
            if path.exists() and not path.is_dir():
                errors.append(f"{path_name} exists but is not a directory: {path_value}")
        
        # Validate temperature
        if not 0 <= self.temperature <= 1:
            errors.append("temperature must be between 0 and 1")
        
        # Validate log level
        valid_log_levels = ["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]
        if self.log_level.upper() not in valid_log_levels:
            errors.append(f"log_level must be one of: {valid_log_levels}")
        
        return errors
    
    def apply_overrides(self, overrides: Dict[str, Any]):
        """Apply configuration overrides"""
        for key, value in overrides.items():
            if hasattr(self, key):
                setattr(self, key, value)
    
    def get_farm_config(self) -> Dict[str, Any]:
        """Get configuration formatted for farm usage"""
        return {
            "farm_id": self.farm_id,
            "workspace_path": self.workspace_path,
            "barn_path": self.barn_path,
            "coordination_path": self.coordination_path,
            "harvest_path": self.harvest_path,
            "timeout": self.timeout,
            "debug": self.debug,
            "provider": self.provider
        }

class ConfigManager:
    """Manages ReapAgent configurations"""
    
    def __init__(self, base_config_dir: Optional[str] = None):
        """
        Initialize config manager
        
        Args:
            base_config_dir: Base directory for configurations
        """
        if base_config_dir:
            self.config_dir = Path(base_config_dir)
        else:
            self.config_dir = Path(os.environ.get("REAP_CONFIG_DIR", "/tmp/reapagents/configs"))
        
        self.config_dir.mkdir(parents=True, exist_ok=True)
        self.configs: Dict[str, ReapConfig] = {}
    
    def load_config(self, farm_id: str) -> Optional[ReapConfig]:
        """
        Load configuration for a farm
        
        Args:
            farm_id: Farm identifier
        
        Returns:
            Configuration or None if not found
        """
        # Check cache first
        if farm_id in self.configs:
            return self.configs[farm_id]
        
        # Try to load from file
        config_file = self.config_dir / f"{farm_id}.yaml"
        if config_file.exists():
            try:
                config = ReapConfig.from_file(str(config_file))
                self.configs[farm_id] = config
                return config
            except Exception as e:
                print(f"Failed to load config for {farm_id}: {e}")
        
        return None
    
    def save_config(self, config: ReapConfig):
        """
        Save configuration
        
        Args:
            config: Configuration to save
        """
        config_file = self.config_dir / f"{config.farm_id}.yaml"
        config.save(str(config_file))
        self.configs[config.farm_id] = config
    
    def create_default_config(self, farm_id: str, **kwargs) -> ReapConfig:
        """
        Create a default configuration
        
        Args:
            farm_id: Farm identifier
            **kwargs: Configuration overrides
        
        Returns:
            New configuration
        """
        config = ReapConfig(farm_id=farm_id, **kwargs)
        self.save_config(config)
        return config
    
    def list_configs(self) -> List[str]:
        """
        List all available configurations
        
        Returns:
            List of farm IDs with configurations
        """
        configs = []
        for config_file in self.config_dir.glob("*.yaml"):
            configs.append(config_file.stem)
        return sorted(configs)
    
    def delete_config(self, farm_id: str) -> bool:
        """
        Delete a configuration
        
        Args:
            farm_id: Farm identifier
        
        Returns:
            True if deleted, False if not found
        """
        config_file = self.config_dir / f"{farm_id}.yaml"
        if config_file.exists():
            config_file.unlink()
            if farm_id in self.configs:
                del self.configs[farm_id]
            return True
        return False

# Global config manager instance
config_manager = ConfigManager()