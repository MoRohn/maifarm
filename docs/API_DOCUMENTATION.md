# MaiFarm API Documentation

## Overview
MaiFarm provides a comprehensive REST API for managing AI agent farms, tasks, and harvests. All API endpoints require authentication and appropriate permissions.

## Base URL
```
Development: http://localhost:4567/api
Production: https://api.maifarm.ai/api
```

## Authentication
All API requests require a JWT token in the Authorization header:
```http
Authorization: Bearer <your-jwt-token>
```

### Obtaining a Token
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password"
}
```

Response:
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "id": "user-uuid",
      "email": "user@example.com",
      "roles": ["user"]
    }
  }
}
```

## Rate Limiting

All endpoints are rate limited based on operation type:

| Limit Type | Requests | Window | Endpoints |
|------------|----------|--------|-----------|
| Standard | 100 | 1 minute | General endpoints |
| Authentication | 5 | 15 minutes | Login, register |
| Farm Creation | 10 | 1 hour | POST /farms |
| Quick Tasks | 20 | 5 minutes | POST /tasks/quick |
| Expensive | 10 | 1 minute | GoWild, launch operations |

Rate limit headers are included in all responses:
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 2024-01-20T12:00:00Z
Retry-After: 60
```

## Error Responses

All errors follow a consistent format:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

Common error codes:
- `UNAUTHORIZED` - Missing or invalid authentication
- `FORBIDDEN` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `VALIDATION_ERROR` - Invalid request data
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INTERNAL_ERROR` - Server error

## Endpoints

### Farms

#### List Farms
```http
GET /api/farms?page=1&limit=10&status=active&sortBy=created_at&sortOrder=desc
```

Query Parameters:
- `page` (number, default: 1) - Page number
- `limit` (number, default: 10) - Items per page
- `status` (string) - Filter by status: idle, launching, running, active, completed, failed
- `sortBy` (string) - Sort field: created_at, updated_at, name
- `sortOrder` (string) - Sort order: asc, desc
- `search` (string) - Search in name and description
- `tags` (string[]) - Filter by tags

Response:
```json
{
  "success": true,
  "data": [
    {
      "id": "farm-uuid",
      "name": "Research Farm",
      "description": "AI research collaboration",
      "status": "active",
      "agents": [...],
      "config": {},
      "metrics": {},
      "tags": ["research"],
      "createdBy": "user-uuid",
      "createdAt": "2024-01-20T10:00:00Z",
      "updatedAt": "2024-01-20T10:30:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 10,
    "total": 25,
    "timestamp": "2024-01-20T10:30:00Z"
  }
}
```

#### Get Farm Details
```http
GET /api/farms/:id
```

Response includes full farm details with agents and configuration.

#### Create Farm
```http
POST /api/farms
Content-Type: multipart/form-data

{
  "name": "Research Farm",
  "description": "AI research collaboration",
  "config": {
    "provider": "claude",
    "model": "claude-3-sonnet",
    "agentCount": 3,
    "timeout": 3600,
    "features": {
      "xenosync": true,
      "autoHarvest": true
    }
  },
  "files": [/* optional file uploads */]
}
```

#### Launch Farm
```http
POST /api/farms/:id/launch
Content-Type: application/json

{
  "prompt": "Build a web application",
  "yamlConfig": "optional YAML configuration"
}
```

#### Harvest Farm Results
```http
POST /api/farms/:id/harvest
```

Triggers collection of all farm outputs into the barn.

#### Stop Farm
```http
POST /api/farms/:id/stop
```

#### Delete Farm
```http
DELETE /api/farms/:id
```

### Tasks

#### Quick Task
```http
POST /api/tasks/quick
Content-Type: multipart/form-data

{
  "title": "Quick Analysis",
  "description": "Analyze this code",
  "priority": "high",
  "timeout": 300,
  "mode": "quick",
  "provider": "claude",
  "files": [/* optional file uploads */]
}
```

Quick tasks have a fixed 5-minute timeout and use a single agent.

#### List Tasks
```http
GET /api/tasks?status=pending&type=quick
```

#### Get Task Status
```http
GET /api/tasks/:id
```

### GoWild Mode

#### Start GoWild Session
```http
POST /api/go-wild
Content-Type: multipart/form-data

{
  "prompt": "Explore innovative solutions",
  "agentCount": 5,
  "timeout": 1800,
  "boundaries": {
    "maxExplorationDepth": 10,
    "creativityLevel": 0.8,
    "safetyLevel": "high"
  },
  "files": [/* optional context files */]
}
```

#### Stop GoWild Session
```http
POST /api/go-wild/:farmId/stop
```

### Harvest & Barn

#### List Harvests
```http
GET /api/harvests?farmId=xxx&status=ready
```

#### Get Harvest Details
```http
GET /api/harvests/:id
```

#### Download Harvest
```http
GET /api/harvests/:id/download
```

Returns a ZIP file containing all harvest artifacts.

#### List Barn Items
```http
GET /api/barn?category=code&search=function
```

#### Get Barn Item
```http
GET /api/barn/:id
```

### Seeds

#### List Seeds
```http
GET /api/seeds?isPublic=true&category=web-dev
```

#### Create Seed from Harvest
```http
POST /api/seeds
Content-Type: application/json

{
  "name": "Web App Template",
  "description": "React + Express starter",
  "harvestId": "harvest-uuid",
  "category": "web-dev",
  "isPublic": true,
  "config": {}
}
```

#### Create Farm from Seed
```http
POST /api/farms/from-seed
Content-Type: application/json

{
  "seedId": "seed-uuid",
  "name": "My Web App",
  "description": "Building with template",
  "autoHarvest": true
}
```

### Monitoring

#### System Health
```http
GET /api/monitor/health
```

Returns overall system health status.

#### Metrics Dashboard
```http
GET /api/monitor/dashboard
```

Comprehensive metrics including system, application, and performance data.

#### Rate Limit Status
```http
GET /api/monitor/rate-limits
```

Current rate limiting status for all tracked endpoints.

#### Circuit Breakers
```http
GET /api/monitor/circuit-breakers
```

Status of circuit breakers for external services.

### WebSocket Events

Connect to WebSocket for real-time updates:
```javascript
const socket = io('ws://localhost:4567', {
  auth: {
    token: 'your-jwt-token'
  }
});
```

#### Subscribe to Events
```javascript
// Farm events
socket.on('farm:created', (farm) => {});
socket.on('farm:status', (status) => {});
socket.on('farm:completed', (result) => {});

// Agent events
socket.on('agent:status', (status) => {});
socket.on('agent:updated', (agent) => {});
socket.on('agent:recovered', (agent) => {});

// Harvest events
socket.on('harvest:ready', (harvest) => {});
socket.on('harvest:collected', (harvest) => {});

// Terminal output
socket.emit('terminal:join', { farmId, agentId });
socket.on('terminal:output', (data) => {});

// Monitoring
socket.emit('monitoring:subscribe', ['metrics', 'health']);
socket.on('monitoring:metrics', (metrics) => {});
socket.on('monitoring:health', (health) => {});
socket.on('monitoring:alert', (alert) => {});
```

## Permissions

Required permissions for endpoints:

| Permission | Endpoints |
|------------|-----------|
| `farms:read` | GET /farms, GET /farms/:id |
| `farms:create` | POST /farms, POST /farms/from-seed |
| `farms:update` | PUT /farms/:id |
| `farms:delete` | DELETE /farms/:id |
| `farms:control` | POST /farms/:id/launch, POST /farms/:id/stop |
| `farms:harvest` | POST /farms/:id/harvest |
| `tasks:create` | POST /tasks/quick |
| `tasks:read` | GET /tasks |
| `barn:read` | GET /barn |
| `seeds:read` | GET /seeds |
| `seeds:create` | POST /seeds |
| `system:monitor` | GET /monitor/* |
| `system:admin` | Administrative operations |

## Code Examples

### JavaScript/Node.js
```javascript
const axios = require('axios');

const API_BASE = 'http://localhost:4567/api';
const TOKEN = 'your-jwt-token';

// Create and launch a farm
async function createAndLaunchFarm() {
  try {
    // Create farm
    const createResponse = await axios.post(
      `${API_BASE}/farms`,
      {
        name: 'My Farm',
        description: 'Test farm',
        config: {
          provider: 'claude',
          agentCount: 3
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const farmId = createResponse.data.data.id;

    // Launch farm
    const launchResponse = await axios.post(
      `${API_BASE}/farms/${farmId}/launch`,
      {
        prompt: 'Build a TODO app'
      },
      {
        headers: {
          'Authorization': `Bearer ${TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Farm launched:', launchResponse.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}
```

### Python
```python
import requests
import json

API_BASE = 'http://localhost:4567/api'
TOKEN = 'your-jwt-token'

def quick_task(prompt, files=None):
    """Execute a quick task"""

    headers = {
        'Authorization': f'Bearer {TOKEN}'
    }

    data = {
        'title': 'Quick Task',
        'description': prompt,
        'priority': 'normal'
    }

    files_data = []
    if files:
        for filepath in files:
            files_data.append(
                ('files', open(filepath, 'rb'))
            )

    response = requests.post(
        f'{API_BASE}/tasks/quick',
        data=data,
        files=files_data,
        headers=headers
    )

    return response.json()

# Usage
result = quick_task('Analyze this code for bugs', ['app.js'])
print(json.dumps(result, indent=2))
```

### cURL
```bash
# Login
curl -X POST http://localhost:4567/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}'

# Create farm
curl -X POST http://localhost:4567/api/farms \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Farm",
    "description": "Testing",
    "config": {
      "provider": "claude",
      "agentCount": 2
    }
  }'

# Quick task
curl -X POST http://localhost:4567/api/tasks/quick \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "title=Quick Analysis" \
  -F "description=Analyze this" \
  -F "files=@code.js"

# Monitor health
curl -X GET http://localhost:4567/api/monitor/health \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Best Practices

1. **Rate Limiting**: Implement exponential backoff when receiving 429 responses
2. **Error Handling**: Always check `success` field and handle errors appropriately
3. **WebSocket Reconnection**: Implement automatic reconnection with exponential backoff
4. **File Uploads**: Keep files under 10MB and use supported formats
5. **Pagination**: Always paginate when listing resources
6. **Caching**: Cache frequently accessed data like seeds and barn items
7. **Timeouts**: Set appropriate client-side timeouts (30s for normal, 5min for farms)

## SDK Support

Official SDKs are planned for:
- JavaScript/TypeScript (Node.js & Browser)
- Python
- Go
- Java

Community SDKs:
- Ruby
- PHP
- C#/.NET

## Changelog

### v2.0.0 (Current)
- Advanced rate limiting with token bucket algorithm
- Circuit breaker pattern for external services
- Comprehensive monitoring dashboard
- WebSocket event improvements
- XenoSync integration

### v1.0.0
- Initial API release
- Basic CRUD operations
- WebSocket support
- Authentication and authorization