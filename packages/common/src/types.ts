// Core domain types for Agentic Observability Platform

export type EntityId = string;

// Re-export all model types
export * from './models/index.js';

/**
 * Canonical error payload. Routes and middleware return this wrapped under
 * an `error` key:
 *
 *   { "error": { "code": "VALIDATION", "message": "…", "details": … } }
 *
 * Use `ApiErrorResponse` for the full response body type.
 */
export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

/**
 * Full HTTP error response body. Every non-2xx response from the API uses
 * this envelope so clients can read `body.error.code` / `body.error.message`
 * uniformly. See `packages/api-gateway/src/middleware/error-handler.ts`.
 */
export interface ApiErrorResponse {
  error: ApiError;
}
