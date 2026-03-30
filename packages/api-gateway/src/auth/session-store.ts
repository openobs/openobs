import crypto from 'crypto'
import type { Session } from './types.js'

export class SessionStore {
  private sessions = new Map<string, Session>()
  private refreshTokenIndex = new Map<string, string>() // refreshToken -> sessionId

  create(
    userId: string,
    accessToken: string,
    refreshToken: string,
    ttlMs: number,
    meta?: { ipAddress?: string, userAgent?: string },
  ): Session {
    const id = crypto.randomUUID()
    const now = Date.now()
    const session: Session = {
      id,
      userId,
      accessToken,
      refreshToken,
      expiresAt: now + ttlMs,
      createdAt: now,
      ...meta,
    }
    this.sessions.set(id, session)
    this.refreshTokenIndex.set(refreshToken, id)
    return session
  }

  get(id: string): Session | undefined {
    const s = this.sessions.get(id)
    if (s && Date.now() > s.expiresAt) {
      this.revoke(id)
      return undefined
    }
    return s
  }

  getByRefreshToken(refreshToken: string): Session | undefined {
    const id = this.refreshTokenIndex.get(refreshToken)
    if (!id)
      return undefined
    return this.get(id)
  }

  getByUserId(userId: string): Session[] {
    return [...this.sessions.values()].filter((s) => s.userId === userId)
  }

  revoke(id: string): void {
    const s = this.sessions.get(id)
    if (s) {
      this.refreshTokenIndex.delete(s.refreshToken)
      this.sessions.delete(id)
    }
  }

  revokeAllForUser(userId: string): void {
    for (const [id, s] of this.sessions) {
      if (s.userId === userId)
        this.revoke(id)
    }
  }

  purgeExpired(): number {
    let count = 0
    const now = Date.now()
    for (const [id, s] of this.sessions) {
      if (now > s.expiresAt) {
        this.revoke(id)
        count++
      }
    }
    return count
  }

  count(): number {
    return this.sessions.size
  }
}

export const sessionStore = new SessionStore()
