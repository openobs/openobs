// @agentic-obs/common - Shared types and utilities

export * from './types.js';
export * from './config/index.js';
export * from './logging/index.js';
export * from './events/index.js';
export * from './queue/index.js';
export * from './lifecycle/index.js';
export * from './errors/index.js';
export * from './models/index.js';
export * from './repositories/index.js';
export * from './adapter-types.js';

// Wave 2 — auth / perm shared primitives
export * from './auth/index.js';
export * from './audit/index.js';
export * from './crypto/index.js';
// Wave 2 — RBAC: action catalog, scope grammar, evaluator, built-in role
// definitions. Pure TS (frontend-safe) per docs/auth-perm-design/03-rbac-model.md.
export * from './rbac/index.js';
