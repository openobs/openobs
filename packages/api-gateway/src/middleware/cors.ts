import corsLib from 'cors'
import type { CorsOptions } from 'cors'
import { createLogger } from '@agentic-obs/server-utils/logging'

const log = createLogger('cors')

function parseOrigins(rawOrigins: string | undefined): string[] {
  return (rawOrigins ?? '').split(',').map((o) => o.trim()).filter(Boolean)
}

function isLocalDevOrigin(origin: string): boolean {
  try {
    const url = new URL(origin)
    return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

export function createCorsOptions(env: NodeJS.ProcessEnv = process.env): CorsOptions {
  const isProd = env['NODE_ENV'] === 'production'
  const rawOrigins = env['CORS_ORIGINS']

  let corsOrigin: CorsOptions['origin']
  let credentials: boolean

  if (isProd) {
    // Production: require explicit CORS_ORIGINS, reject wildcard.
    const origins = parseOrigins(rawOrigins)
    if (origins.length === 0 || origins.includes('*')) {
      throw new Error(
        '[cors] FATAL: CORS_ORIGINS must not be "*" or empty in production. ' +
        'Set CORS_ORIGINS to a comma-separated list of allowed origins.',
      )
    }
    corsOrigin = origins
    credentials = true
  } else if (rawOrigins) {
    // Non-production with explicit CORS_ORIGINS.
    const origins = parseOrigins(rawOrigins)
    if (origins.includes('*')) {
      log.warn('CORS is open to all origins ("*"). Restrict CORS_ORIGINS before deploying to production.')
      corsOrigin = true
      credentials = false
    } else {
      corsOrigin = origins
      credentials = true
    }
  } else {
    // Non-production default: allow credentialed browser calls only from
    // local development origins. Non-browser requests with no Origin header
    // still pass through.
    corsOrigin = (origin, cb) => {
      if (!origin || isLocalDevOrigin(origin)) {
        cb(null, true)
        return
      }
      cb(null, false)
    }
    credentials = true
  }

  return {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'Accept', 'X-CSRF-Token', 'X-Openobs-Org-Id', 'Last-Event-ID'],
    credentials,
  }
}

export const cors = corsLib(createCorsOptions())
