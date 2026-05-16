import type { Request, Response, NextFunction } from 'express'
import type { ApiError, ApiErrorResponse } from '@agentic-obs/common'
import { AppError } from '@agentic-obs/common'
import { createLogger } from '@agentic-obs/server-utils/logging'

const log = createLogger('error-handler')

/**
 * Legacy shape for errors thrown before the structured AppError hierarchy.
 * Kept for backward compatibility — existing route handlers that throw
 * plain objects with these fields will continue to work.
 */
export interface LegacyAppError extends Error {
  statusCode?: number
  code?: string
  /** If true, err.message is safe to expose to the client */
  isClientSafe?: boolean
}

export function errorHandler(
  err: AppError | LegacyAppError,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  // --- Structured error hierarchy (preferred path) ---
  if (err instanceof AppError) {
    const { statusCode, code, message, details } = err

    if (statusCode >= 500) {
      log.error({ statusCode, message, stack: err.stack }, 'unhandled server error')
    }

    const safeMessage = statusCode >= 500 ? 'Internal server error' : message

    const inner: ApiError = { code, message: safeMessage }
    if (details !== undefined) {
      inner.details = details
    }

    const body: ApiErrorResponse = { error: inner }
    res.status(statusCode).json(body)
    return
  }

  // --- Legacy / unstructured errors (backward compat) ---
  const legacyErr = err as LegacyAppError
  const statusCode = legacyErr.statusCode ?? 500
  const safeMessage = statusCode >= 500
    ? 'Internal server error'
    : legacyErr.isClientSafe === true
      ? legacyErr.message
      : 'Request could not be processed'

  const inner: ApiError = {
    code: legacyErr.code ?? (statusCode >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST'),
    message: safeMessage,
  }

  if (statusCode >= 500) {
    log.error({ statusCode, message: legacyErr.message, stack: legacyErr.stack }, 'unhandled server error')
  }

  const body: ApiErrorResponse = { error: inner }
  res.status(statusCode).json(body)
}

export function notFoundHandler(req: Request, res: Response): void {
  const body: ApiErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
  }
  res.status(404).json(body)
}
