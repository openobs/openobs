import crypto from 'crypto'
import type { User, Team, AuditLogEntry } from './types.js'

export class UserStore {
  private users = new Map<string, User>()
  private emailIndex = new Map<string, string>() // lowercase email -> userId
  private externalIndex = new Map<string, string>() // provider:externalId -> userId
  private teams = new Map<string, Team>()
  private auditLog: AuditLogEntry[] = []

  // Users
  create(data: Omit<User, 'id' | 'createdAt' | 'lastLoginAt'>): User {
    const user: User = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    }
    this.users.set(user.id, user)
    this.emailIndex.set(user.email.toLowerCase(), user.id)
    if (user.externalId) {
      this.externalIndex.set(`${user.authProvider}:${user.externalId}`, user.id)
    }
    return user
  }

  findById(id: string): User | undefined {
    return this.users.get(id)
  }

  findByEmail(email: string): User | undefined {
    const id = this.emailIndex.get(email.toLowerCase())
    return id ? this.users.get(id) : undefined
  }

  findByExternalId(provider: string, externalId: string): User | undefined {
    const id = this.externalIndex.get(`${provider}:${externalId}`)
    return id ? this.users.get(id) : undefined
  }

  update(id: string, data: Partial<User>): User | undefined {
    const user = this.users.get(id)
    if (!user)
      return undefined
    if (data.email && data.email !== user.email) {
      this.emailIndex.delete(user.email.toLowerCase())
      this.emailIndex.set(data.email.toLowerCase(), id)
    }
    if (data.externalId && data.externalId !== user.externalId) {
      if (user.externalId) {
        this.externalIndex.delete(`${user.authProvider}:${user.externalId}`)
      }
      this.externalIndex.set(`${data.authProvider || user.authProvider}:${data.externalId}`, id)
    }
    const updated = { ...user, ...data }
    this.users.set(id, updated)
    return updated
  }

  updateLastLogin(id: string): void {
    const user = this.users.get(id)
    if (user) {
      this.users.set(id, { ...user, lastLoginAt: new Date().toISOString() })
    }
  }

  delete(id: string): boolean {
    const user = this.users.get(id)
    if (!user)
      return false
    this.emailIndex.delete(user.email.toLowerCase())
    if (user.externalId) {
      this.externalIndex.delete(`${user.authProvider}:${user.externalId}`)
    }
    this.users.delete(id)
    return true
  }

  list(): User[] {
    return [...this.users.values()]
  }

  count(): number {
    return this.users.size
  }

  // Teams
  createTeam(data: Omit<Team, 'id' | 'createdAt'>): Team {
    const team: Team = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    }
    this.teams.set(team.id, team)
    return team
  }

  findTeamById(id: string): Team | undefined {
    return this.teams.get(id)
  }

  updateTeam(id: string, data: Partial<Team>): Team | undefined {
    const team = this.teams.get(id)
    if (!team)
      return undefined
    const updated = { ...team, ...data }
    this.teams.set(id, updated)
    return updated
  }

  deleteTeam(id: string): boolean {
    return this.teams.delete(id)
  }

  listTeams(): Team[] {
    return [...this.teams.values()]
  }

  // Audit Log
  addAuditEntry(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>): void {
    this.auditLog.push({
      ...entry,
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
    })
    // Keep the last 10,000 entries
    if (this.auditLog.length > 10_000) {
      this.auditLog.splice(0, this.auditLog.length - 10_000)
    }
  }

  getAuditLog(limit = 100, offset = 0): { entries: AuditLogEntry[], total: number } {
    const total = this.auditLog.length
    const entries = [...this.auditLog].reverse().slice(offset, offset + limit)
    return { entries, total }
  }
}

export const userStore = new UserStore()
