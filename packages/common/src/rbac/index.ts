/**
 * @agentic-obs/common — rbac module public surface.
 *
 * Backend middleware and the frontend UI both import from here. Everything
 * re-exported from this file MUST be pure TypeScript with no node-only deps.
 */

export * from './actions.js';
export * from './scope.js';
export * from './evaluator.js';
export * from './roles-def.js';
export * from './fixed-roles-def.js';
