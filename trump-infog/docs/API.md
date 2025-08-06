# Trump Infog API Documentation

## Overview

The Trump Infog API provides comprehensive endpoints for creating, managing, and exporting professional infographics. This document covers REST endpoints, GraphQL queries, WebSocket events, and authentication.

## Base URL

```
Production: https://api.trumpinfog.com/v1
Development: http://localhost:4567/api/v1
```

## Authentication

All API requests require authentication using JWT tokens.

### Obtaining a Token

```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "secure_password"
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "123",
    "email": "user@example.com",
    "role": "editor"
  }
}
```

### Using the Token

Include the token in the Authorization header:
```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

## REST API Endpoints

### Infographics

#### List Infographics
```http
GET /infographics
```

Query Parameters:
- `page` (integer): Page number (default: 1)
- `limit` (integer): Items per page (default: 20, max: 100)
- `status` (string): Filter by status (draft, published, archived)
- `search` (string): Search in title and description
- `sort` (string): Sort field (created_at, updated_at, title)
- `order` (string): Sort order (asc, desc)

Response:
```json
{
  "data": [
    {
      "id": "inf_123abc",
      "title": "2024 Election Results Overview",
      "description": "Comprehensive visualization of election data",
      "status": "published",
      "template": "election-results",
      "created_at": "2025-01-15T10:00:00Z",
      "updated_at": "2025-01-15T14:30:00Z",
      "author": {
        "id": "user_456",
        "name": "John Doe"
      },
      "metrics": {
        "views": 15420,
        "exports": 234,
        "shares": 567
      }
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 145,
    "pages": 8
  }
}
```

#### Create Infographic
```http
POST /infographics
Content-Type: application/json

{
  "title": "2024 Election Victory Analysis",
  "description": "Detailed breakdown of key victory factors",
  "template": "election-results",
  "data_source": "election-api-2024",
  "config": {
    "theme": "professional",
    "color_scheme": "red-white-blue",
    "dimensions": {
      "width": 1920,
      "height": 1080
    }
  }
}
```

Response:
```json
{
  "id": "inf_789xyz",
  "title": "2024 Election Victory Analysis",
  "status": "draft",
  "created_at": "2025-01-20T09:15:00Z",
  "edit_url": "https://app.trumpinfog.com/editor/inf_789xyz",
  "preview_url": "https://app.trumpinfog.com/preview/inf_789xyz"
}
```

#### Get Infographic Details
```http
GET /infographics/:id
```

Response:
```json
{
  "id": "inf_123abc",
  "title": "2024 Election Results Overview",
  "description": "Comprehensive visualization of election data",
  "status": "published",
  "template": "election-results",
  "data": {
    "electoral_votes": { /* ... */ },
    "popular_vote": { /* ... */ },
    "demographics": { /* ... */ }
  },
  "visualizations": [
    {
      "id": "viz_001",
      "type": "electoral-map",
      "config": { /* ... */ }
    },
    {
      "id": "viz_002",
      "type": "bar-chart",
      "config": { /* ... */ }
    }
  ],
  "created_at": "2025-01-15T10:00:00Z",
  "updated_at": "2025-01-15T14:30:00Z",
  "published_at": "2025-01-15T15:00:00Z"
}
```

#### Update Infographic
```http
PUT /infographics/:id
Content-Type: application/json

{
  "title": "Updated Title",
  "description": "Updated description",
  "visualizations": [
    {
      "id": "viz_001",
      "config": {
        "colors": ["#FF0000", "#0000FF", "#FFFFFF"]
      }
    }
  ]
}
```

#### Delete Infographic
```http
DELETE /infographics/:id
```

#### Export Infographic
```http
POST /infographics/:id/export
Content-Type: application/json

{
  "format": "png",
  "resolution": "high",
  "dimensions": {
    "width": 3840,
    "height": 2160
  },
  "options": {
    "include_watermark": false,
    "optimize_for_print": true
  }
}
```

Response:
```json
{
  "export_id": "exp_abc123",
  "status": "processing",
  "estimated_time": 30,
  "webhook_url": "https://api.trumpinfog.com/exports/exp_abc123/status"
}
```

### Templates

#### List Templates
```http
GET /templates
```

Response:
```json
{
  "templates": [
    {
      "id": "election-results",
      "name": "Election Results",
      "description": "Comprehensive election data visualization",
      "preview_url": "https://cdn.trumpinfog.com/templates/election-results.png",
      "categories": ["politics", "data-viz"],
      "components": [
        "electoral-map",
        "vote-breakdown",
        "demographic-charts"
      ]
    }
  ]
}
```

### Data Sources

#### List Data Sources
```http
GET /data-sources
```

Response:
```json
{
  "sources": [
    {
      "id": "election-api-2024",
      "name": "2024 Election Data API",
      "type": "rest-api",
      "status": "active",
      "fields": [
        {
          "name": "electoral_votes",
          "type": "object",
          "description": "State-by-state electoral vote counts"
        }
      ],
      "last_updated": "2025-01-20T08:00:00Z"
    }
  ]
}
```

#### Refresh Data Source
```http
POST /data-sources/:id/refresh
```

### Collaboration

#### Share Infographic
```http
POST /infographics/:id/share
Content-Type: application/json

{
  "users": ["user@example.com"],
  "permission": "edit",
  "message": "Please review this infographic"
}
```

#### List Collaborators
```http
GET /infographics/:id/collaborators
```

## GraphQL API

### Endpoint
```
POST /graphql
```

### Schema

```graphql
type Query {
  infographic(id: ID!): Infographic
  infographics(
    filter: InfographicFilter
    pagination: PaginationInput
  ): InfographicConnection!
  
  templates: [Template!]!
  dataSources: [DataSource!]!
  
  user(id: ID!): User
  currentUser: User
}

type Mutation {
  createInfographic(input: CreateInfographicInput!): Infographic!
  updateInfographic(id: ID!, input: UpdateInfographicInput!): Infographic!
  deleteInfographic(id: ID!): Boolean!
  
  exportInfographic(id: ID!, format: ExportFormat!): Export!
  
  shareInfographic(id: ID!, input: ShareInput!): Share!
}

type Subscription {
  infographicUpdated(id: ID!): Infographic!
  exportProgress(exportId: ID!): ExportStatus!
}
```

### Example Queries

#### Get Infographic with Visualizations
```graphql
query GetInfographic($id: ID!) {
  infographic(id: $id) {
    id
    title
    description
    visualizations {
      id
      type
      data
      config
    }
    author {
      id
      name
      avatar
    }
    metrics {
      views
      exports
      shares
    }
  }
}
```

#### Create Infographic
```graphql
mutation CreateInfographic($input: CreateInfographicInput!) {
  createInfographic(input: $input) {
    id
    title
    status
    editUrl
    previewUrl
  }
}
```

## WebSocket API

### Connection
```javascript
const ws = new WebSocket('wss://api.trumpinfog.com/ws');

// Authentication
ws.send(JSON.stringify({
  type: 'auth',
  token: 'your-jwt-token'
}));
```

### Events

#### Server → Client

##### Infographic Updated
```json
{
  "type": "infographic:updated",
  "data": {
    "id": "inf_123abc",
    "changes": {
      "title": "New Title",
      "updated_at": "2025-01-20T10:30:00Z"
    },
    "user": {
      "id": "user_456",
      "name": "John Doe"
    }
  }
}
```

##### Agent Status
```json
{
  "type": "agent:status",
  "data": {
    "agent": "frontend-artist",
    "status": "processing",
    "task": "Optimizing visualization layout",
    "progress": 65
  }
}
```

##### Export Progress
```json
{
  "type": "export:progress",
  "data": {
    "export_id": "exp_abc123",
    "status": "processing",
    "progress": 80,
    "estimated_remaining": 10
  }
}
```

#### Client → Server

##### Subscribe to Infographic
```json
{
  "type": "subscribe:infographic",
  "data": {
    "id": "inf_123abc"
  }
}
```

##### Request Data Refresh
```json
{
  "type": "data:refresh",
  "data": {
    "infographic_id": "inf_123abc",
    "source_id": "election-api-2024"
  }
}
```

## Error Responses

All errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input provided",
    "details": [
      {
        "field": "title",
        "message": "Title is required"
      }
    ],
    "request_id": "req_xyz789"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `AUTHENTICATION_REQUIRED` | 401 | Missing or invalid authentication |
| `PERMISSION_DENIED` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid input data |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Internal server error |

## Rate Limiting

API requests are rate limited per user:

- **Standard tier**: 100 requests per minute
- **Professional tier**: 500 requests per minute
- **Enterprise tier**: Unlimited

Rate limit information is included in response headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642684800
```

## Webhooks

Configure webhooks to receive real-time notifications:

### Webhook Events

- `infographic.created`
- `infographic.updated`
- `infographic.published`
- `export.completed`
- `collaboration.invited`

### Webhook Payload

```json
{
  "event": "infographic.published",
  "created_at": "2025-01-20T15:00:00Z",
  "data": {
    "infographic": {
      "id": "inf_123abc",
      "title": "2024 Election Results",
      "published_url": "https://trumpinfog.com/inf/123abc"
    }
  }
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { TrumpInfogClient } from '@trumpinfog/sdk';

const client = new TrumpInfogClient({
  apiKey: process.env.TRUMP_INFOG_API_KEY
});

// Create infographic
const infographic = await client.infographics.create({
  title: '2024 Victory Analysis',
  template: 'election-results',
  dataSource: 'election-api-2024'
});

// Export as PNG
const exportJob = await client.exports.create(infographic.id, {
  format: 'png',
  resolution: 'high'
});
```

### Python

```python
from trumpinfog import Client

client = Client(api_key=os.environ['TRUMP_INFOG_API_KEY'])

# List infographics
infographics = client.infographics.list(
    status='published',
    limit=10
)

# Update infographic
client.infographics.update(
    'inf_123abc',
    title='Updated Title'
)
```

## Testing

Use our sandbox environment for testing:

- Base URL: `https://sandbox.trumpinfog.com/api/v1`
- Test API Key: `test_key_abc123xyz`

The sandbox environment resets daily and provides sample data for testing.

---

For additional support, contact our API team at api-support@trumpinfog.com