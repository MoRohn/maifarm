#!/usr/bin/env python3
"""
Redis Coordination Client for Python Scripts
Provides interface to interact with the new Redis-based coordination system
"""

import json
import time
import uuid
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
import redis
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class RedisCoordinationClient:
    """Python client for Redis-based farm coordination"""
    
    def __init__(self, redis_host: str = 'localhost', redis_port: int = 6379, redis_db: int = 0):
        """Initialize Redis connection"""
        self.redis_client = redis.Redis(
            host=redis_host,
            port=redis_port,
            db=redis_db,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
            health_check_interval=30
        )
        
        # Test connection
        try:
            self.redis_client.ping()
            logger.info(f"Connected to Redis at {redis_host}:{redis_port}")
        except redis.ConnectionError as e:
            logger.error(f"Failed to connect to Redis: {e}")
            raise
        
        self.key_prefix = 'maifarm:coordination:'
        self.pub_channels = {
            'farm_updates': f'{self.key_prefix}farm:updates',
            'agent_updates': f'{self.key_prefix}agent:updates',
            'system_events': f'{self.key_prefix}system:events'
        }
    
    def farm_exists(self, farm_id: str) -> bool:
        """Check if farm exists in Redis"""
        key = f'{self.key_prefix}farm:{farm_id}'
        return self.redis_client.exists(key) > 0
    
    def get_farm_state(self, farm_id: str) -> Optional[Dict[str, Any]]:
        """Get farm state from Redis"""
        key = f'{self.key_prefix}farm:{farm_id}'
        data = self.redis_client.hgetall(key)
        
        if not data:
            return None
        
        return self._deserialize_farm_state(data)
    
    def create_farm_request(self, farm_id: str, config: Dict[str, Any]) -> Dict[str, Any]:
        """Create a farm launch request structure"""
        return {
            'farmId': farm_id,
            'prompt': config.get('prompt', ''),
            'agentCount': config.get('agent_count', 1),
            'config': {
                'timeout': config.get('timeout', 300000),  # 5 minutes
                'maxRetries': config.get('max_retries', 3),
                'provider': config.get('provider', 'claude'),
                'workingDirectory': config.get('working_directory', '.'),
                'model': config.get('model'),
            },
            'metadata': {
                'name': config.get('name', f'Farm {farm_id[:8]}'),
                'description': config.get('description', ''),
                'yamlContent': config.get('yaml_content'),
                'steps': config.get('steps', []),
                'collaborative': config.get('collaborative', False),
                'debug': config.get('debug', False),
                'farmerTemplateId': config.get('farmer_template_id'),
                'contextFiles': config.get('context_files', []),
                'attachments': config.get('attachments', [])
            }
        }
    
    def get_farm_agents(self, farm_id: str) -> List[Dict[str, Any]]:
        """Get all agents for a farm"""
        agents_key = f'{self.key_prefix}farm:{farm_id}:agents'
        agent_ids = self.redis_client.smembers(agents_key)
        
        agents = []
        if agent_ids:
            # Batch get all agent states
            pipe = self.redis_client.pipeline()
            for agent_id in agent_ids:
                pipe.hgetall(f'{self.key_prefix}agent:{agent_id}')
            
            results = pipe.execute()
            for i, agent_data in enumerate(results):
                if agent_data:
                    agent = self._deserialize_agent_state(agent_data)
                    agents.append(agent)
        
        return agents
    
    def update_agent_heartbeat(self, agent_id: str, metadata: Optional[Dict] = None) -> bool:
        """Record agent heartbeat"""
        try:
            key = f'{self.key_prefix}agent:{agent_id}'
            
            # Get current agent state
            current = self.redis_client.hgetall(key)
            if not current:
                logger.warning(f"Agent {agent_id} not found for heartbeat update")
                return False
            
            # Update heartbeat and metadata
            updates = {
                'lastHeartbeat': datetime.now(timezone.utc).isoformat()
            }
            
            if metadata:
                current_metadata = json.loads(current.get('metadata', '{}'))
                current_metadata.update(metadata)
                updates['metadata'] = json.dumps(current_metadata)
            
            self.redis_client.hset(key, mapping=updates)
            self.redis_client.expire(key, 3600)  # 1 hour TTL
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to update heartbeat for agent {agent_id}: {e}")
            return False
    
    def update_agent_status(self, agent_id: str, status: str, current_task: Optional[str] = None) -> bool:
        """Update agent status"""
        try:
            key = f'{self.key_prefix}agent:{agent_id}'
            
            updates = {
                'status': status,
                'lastHeartbeat': datetime.now(timezone.utc).isoformat()
            }
            
            if current_task:
                updates['currentTask'] = current_task
            
            self.redis_client.hset(key, mapping=updates)
            self.redis_client.expire(key, 3600)
            
            # Publish agent update event
            self._publish_agent_event({
                'type': 'agent:updated',
                'agentId': agent_id,
                'data': {'status': status, 'currentTask': current_task},
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to update status for agent {agent_id}: {e}")
            return False
    
    def get_session_by_farm(self, farm_id: str) -> Optional[Dict[str, Any]]:
        """Get tmux session info for a farm"""
        pattern = f'{self.key_prefix}sessions:*'
        keys = self.redis_client.keys(pattern)
        
        for key in keys:
            session_data = self.redis_client.hgetall(key)
            if session_data.get('farmId') == farm_id:
                return self._deserialize_session_data(session_data)
        
        return None
    
    def monitor_farm_health(self, farm_id: str) -> Dict[str, Any]:
        """Get farm health status"""
        agents = self.get_farm_agents(farm_id)
        
        if not agents:
            return {
                'healthy': 0,
                'stale': 0,
                'failed': 0,
                'total': 0,
                'health_percentage': 100
            }
        
        now = datetime.now(timezone.utc)
        healthy = 0
        stale = 0
        failed = 0
        
        for agent in agents:
            if agent['status'] in ['error', 'timeout']:
                failed += 1
            else:
                # Check heartbeat age
                last_heartbeat = datetime.fromisoformat(agent['lastHeartbeat'].replace('Z', '+00:00'))
                age_seconds = (now - last_heartbeat).total_seconds()
                
                if age_seconds > 300:  # 5 minutes
                    failed += 1
                elif age_seconds > 60:  # 1 minute
                    stale += 1
                else:
                    healthy += 1
        
        total = len(agents)
        health_percentage = (healthy / total * 100) if total > 0 else 100
        
        return {
            'healthy': healthy,
            'stale': stale,
            'failed': failed,
            'total': total,
            'health_percentage': health_percentage
        }
    
    def cleanup_farm_state(self, farm_id: str) -> bool:
        """Clean up all Redis state for a farm"""
        try:
            # Get agent IDs first
            agents_key = f'{self.key_prefix}farm:{farm_id}:agents'
            agent_ids = self.redis_client.smembers(agents_key)
            
            # Build list of keys to delete
            keys_to_delete = [
                f'{self.key_prefix}farm:{farm_id}',
                agents_key,
                f'{self.key_prefix}farm:{farm_id}:events'
            ]
            
            # Add agent keys
            for agent_id in agent_ids:
                keys_to_delete.extend([
                    f'{self.key_prefix}agent:{agent_id}',
                    f'{self.key_prefix}agent:{agent_id}:claims'
                ])
            
            # Delete all keys atomically
            if keys_to_delete:
                deleted = self.redis_client.delete(*keys_to_delete)
                logger.info(f"Cleaned up {deleted} Redis keys for farm {farm_id}")
            
            # Publish farm deletion event
            self._publish_farm_event({
                'type': 'farm:deleted',
                'farmId': farm_id,
                'timestamp': datetime.now(timezone.utc).isoformat()
            })
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to cleanup farm {farm_id}: {e}")
            return False
    
    def subscribe_to_farm_events(self, callback_func):
        """Subscribe to farm events (blocking)"""
        pubsub = self.redis_client.pubsub()
        
        try:
            # Subscribe to all coordination channels
            for channel in self.pub_channels.values():
                pubsub.subscribe(channel)
                
            logger.info("Subscribed to farm events")
            
            for message in pubsub.listen():
                if message['type'] == 'message':
                    try:
                        event_data = json.loads(message['data'])
                        callback_func(message['channel'], event_data)
                    except json.JSONDecodeError as e:
                        logger.error(f"Failed to parse event message: {e}")
                        
        except KeyboardInterrupt:
            logger.info("Event subscription interrupted")
        finally:
            pubsub.close()
    
    def _publish_farm_event(self, event: Dict[str, Any]):
        """Publish farm event to Redis"""
        try:
            channel = self.pub_channels['farm_updates']
            self.redis_client.publish(channel, json.dumps(event))
        except Exception as e:
            logger.error(f"Failed to publish farm event: {e}")
    
    def _publish_agent_event(self, event: Dict[str, Any]):
        """Publish agent event to Redis"""
        try:
            channel = self.pub_channels['agent_updates']
            self.redis_client.publish(channel, json.dumps(event))
        except Exception as e:
            logger.error(f"Failed to publish agent event: {e}")
    
    def _publish_system_event(self, event: Dict[str, Any]):
        """Publish system event to Redis"""
        try:
            channel = self.pub_channels['system_events']
            self.redis_client.publish(channel, json.dumps(event))
        except Exception as e:
            logger.error(f"Failed to publish system event: {e}")
    
    def _deserialize_farm_state(self, data: Dict[str, str]) -> Dict[str, Any]:
        """Convert Redis hash to farm state object"""
        return {
            'id': data['id'],
            'status': data['status'],
            'sessionId': data['sessionId'],
            'agentCount': int(data['agentCount']),
            'startTime': data['startTime'],
            'lastUpdate': data['lastUpdate'],
            'config': json.loads(data.get('config', '{}')),
            'agents': json.loads(data.get('agents', '[]'))
        }
    
    def _deserialize_agent_state(self, data: Dict[str, str]) -> Dict[str, Any]:
        """Convert Redis hash to agent state object"""
        return {
            'id': data['id'],
            'farmId': data['farmId'],
            'sessionId': data['sessionId'],
            'status': data['status'],
            'tmuxPane': data['tmuxPane'],
            'startTime': data['startTime'],
            'lastHeartbeat': data['lastHeartbeat'],
            'currentTask': data.get('currentTask', ''),
            'metadata': json.loads(data.get('metadata', '{}'))
        }
    
    def _deserialize_session_data(self, data: Dict[str, str]) -> Dict[str, Any]:
        """Convert Redis hash to session data object"""
        return {
            'id': data['id'],
            'farmId': data['farmId'],
            'sessionName': data['sessionName'],
            'agentCount': int(data['agentCount']),
            'status': data['status'],
            'createdAt': data['createdAt'],
            'lastActivity': data['lastActivity'],
            'panes': json.loads(data.get('panes', '[]')),
            'config': json.loads(data.get('config', '{}'))
        }
    
    def close(self):
        """Close Redis connection"""
        try:
            self.redis_client.close()
            logger.info("Redis connection closed")
        except Exception as e:
            logger.error(f"Error closing Redis connection: {e}")


# Example usage and testing
if __name__ == '__main__':
    import sys
    
    # Test Redis coordination client
    try:
        client = RedisCoordinationClient()
        
        # Test basic operations
        print("Testing Redis Coordination Client...")
        
        # Test farm existence check
        test_farm_id = "test-farm-" + str(uuid.uuid4())[:8]
        print(f"Farm {test_farm_id} exists: {client.farm_exists(test_farm_id)}")
        
        # Test heartbeat update (should fail for non-existent agent)
        test_agent_id = "test-agent-" + str(uuid.uuid4())[:8]
        result = client.update_agent_heartbeat(test_agent_id, {"test": "data"})
        print(f"Heartbeat update result: {result}")
        
        # Test health monitoring (should return empty results)
        health = client.monitor_farm_health(test_farm_id)
        print(f"Farm health: {health}")
        
        print("Redis Coordination Client test completed successfully!")
        
    except Exception as e:
        print(f"Redis Coordination Client test failed: {e}")
        sys.exit(1)