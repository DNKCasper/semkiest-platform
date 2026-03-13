# API Reference

Base URL: `http://localhost:3001` (development) | `https://api.semkiest.com` (production)

All request and response bodies use `application/json`.

## Authentication

The API uses **JWT Bearer tokens**. Include the token in the `Authorization` header:

```
Authorization: Bearer <token>
```

Tokens expire after the duration configured in `JWT_EXPIRES_IN` (default: `7d`).

### Internal Service Authentication

Service-to-service calls (e.g., from the worker) may use the `X-API-Key` header instead:

```
X-API-Key: <INTERNAL_API_KEY>
```

This is only accepted on internal endpoints when `INTERNAL_API_KEY` is configured.

---

## Error Format

All error responses follow the same shape:

```json
{
  "message": "Human-readable error description",
  "code": "MACHINE_READABLE_CODE",
  "details": {
    "fieldName": ["Validation error message"]
  }
}
```

| HTTP Status | Meaning |
|-------------|---------|
| `400` | Bad request — validation failed; see `details` |
| `401` | Unauthenticated — missing or invalid token |
| `403` | Forbidden — insufficient permissions |
| `404` | Resource not found |
| `409` | Conflict — resource already exists |
| `422` | Unprocessable — request well-formed but semantically invalid |
| `500` | Internal server error |

---

## Health

### `GET /health`

Returns the server liveness status. No authentication required.

**Response `200`**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## Projects

Projects are the primary organizational unit. Each project tracks URLs under test across environments.

### `GET /api/projects`

List projects with optional filtering, sorting, and pagination.

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `search` | `string` | Full-text search on name and description |
| `environment` | `development \| staging \| production` | Filter by environment |
| `status` | `active \| inactive \| archived` | Filter by status |
| `dateFrom` | `string` (ISO 8601) | Filter by creation date (inclusive) |
| `dateTo` | `string` (ISO 8601) | Filter by creation date (inclusive) |
| `page` | `number` | Page number (default: `1`) |
| `pageSize` | `number` | Items per page (default: `20`, max: `100`) |
| `sort` | `name \| createdAt \| lastRunAt` | Sort field (default: `createdAt`) |
| `sortDir` | `asc \| desc` | Sort direction (default: `desc`) |

**Response `200`**
```json
{
  "data": [
    {
      "id": "clx1a2b3c0000d4e5f6g7h8i9",
      "name": "Production API",
      "description": "End-to-end tests for the production REST API",
      "urls": ["https://api.semkiest.com"],
      "environment": "production",
      "status": "active",
      "tags": ["api", "smoke"],
      "owner": "alice@semkiest.com",
      "team": "platform",
      "createdAt": "2024-01-10T09:00:00.000Z",
      "updatedAt": "2024-01-15T10:30:00.000Z",
      "lastRunAt": "2024-01-15T10:00:00.000Z",
      "stats": {
        "totalRuns": 42,
        "passRate": 0.976,
        "totalTests": 215
      }
    }
  ],
  "total": 1,
  "page": 1,
  "pageSize": 20
}
```

---

### `GET /api/projects/:id`

Retrieve a single project by ID.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Project ID (CUID) |

**Response `200`** — same shape as a single item in the list response.

**Response `404`**
```json
{
  "message": "Project not found",
  "code": "PROJECT_NOT_FOUND"
}
```

---

### `POST /api/projects`

Create a new project.

**Request Body**
```json
{
  "name": "Production API",
  "description": "End-to-end tests for the production REST API",
  "urls": ["https://api.semkiest.com"],
  "environment": "production",
  "tags": ["api", "smoke"],
  "owner": "alice@semkiest.com",
  "team": "platform"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Project display name |
| `description` | `string` | No | Optional description |
| `urls` | `string[]` | Yes | URLs under test (at least one) |
| `environment` | `development \| staging \| production` | Yes | Target environment |
| `tags` | `string[]` | No | Arbitrary labels |
| `owner` | `string` | No | Owner email or identifier |
| `team` | `string` | No | Team name |

**Response `201`** — the created project object.

**Response `400`** — validation errors in `details`.

---

### `PUT /api/projects/:id`

Update an existing project. Only provided fields are updated (partial update).

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Project ID (CUID) |

**Request Body** — all fields optional:
```json
{
  "name": "Production API v2",
  "status": "archived",
  "tags": ["api", "smoke", "regression"]
}
```

**Response `200`** — the updated project object.

**Response `404`** — project not found.

---

### `DELETE /api/projects/:id`

Delete a project and all associated data.

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | `string` | Project ID (CUID) |

**Response `204`** — no content on success.

**Response `404`** — project not found.

---

## Data Types

### Project

```typescript
interface Project {
  id: string;              // CUID
  name: string;
  description?: string;
  urls: string[];
  environment: 'development' | 'staging' | 'production';
  status: 'active' | 'inactive' | 'archived';
  tags: string[];
  owner?: string;
  team?: string;
  createdAt: string;       // ISO 8601
  updatedAt: string;       // ISO 8601
  lastRunAt?: string;      // ISO 8601
  stats: ProjectStats;
}

interface ProjectStats {
  totalRuns: number;
  passRate: number;        // 0.0 – 1.0
  totalTests: number;
}
```

---

## OpenAPI Specification

The API exposes an OpenAPI 3.1 specification at:

- **Development:** http://localhost:3001/api-docs
- **JSON spec:** http://localhost:3001/api-docs.json

The interactive Swagger UI is available at `/api-docs` in development.

---

## Rate Limiting

API requests are rate-limited per IP address:

| Tier | Limit |
|------|-------|
| Unauthenticated | 30 requests / minute |
| Authenticated | 300 requests / minute |
| Internal (X-API-Key) | Unlimited |

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 297
X-RateLimit-Reset: 1705315800
```

---

## Pagination

All list endpoints use offset-based pagination:

```
GET /api/projects?page=2&pageSize=20
```

The response always includes `total`, `page`, and `pageSize` to enable clients to calculate total pages:

```javascript
const totalPages = Math.ceil(total / pageSize);
```

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| `0.1.0` | 2024-01 | Initial Projects API |
