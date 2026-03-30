import crypto from 'crypto'
import type { OidcConfig, OidcDiscovery, TokenResponse, UserInfoClaims, UserRole } from './types.js'

interface PkceState {
  state: string
  codeVerifier: string
  nonce: string
  createdAt: number
}

// In-memory PKCE state (expires after 10 minutes)
const pkceStates = new Map<string, PkceState>()

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

export class OidcProvider {
  private discovery: OidcDiscovery | null = null
  private discoveryFetchedAt = 0
  private readonly DISCOVERY_TTL_MS = 5 * 60 * 1000

  constructor(private readonly config: OidcConfig) {}

  async getDiscovery(): Promise<OidcDiscovery> {
    const now = Date.now()
    if (this.discovery && now - this.discoveryFetchedAt < this.DISCOVERY_TTL_MS)
      return this.discovery

    const url = `${this.config.issuer.replace(/\/$/, '')}/.well-known/openid-configuration`
    const res = await fetch(url)
    if (!res.ok)
      throw new Error(`OIDC discovery failed: HTTP ${res.status}`)
    this.discovery = (await res.json()) as OidcDiscovery
    this.discoveryFetchedAt = now
    return this.discovery
  }

  async getAuthorizationUrl(): Promise<{ url: string, state: string }> {
    const disc = await this.getDiscovery()
    const state = crypto.randomBytes(16).toString('hex')
    const nonce = crypto.randomBytes(16).toString('hex')
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    pkceStates.set(state, { state, codeVerifier, nonce, createdAt: Date.now() })
    // Purge expired states
    for (const [k, v] of pkceStates) {
      if (Date.now() - v.createdAt > 10 * 60 * 1000)
        pkceStates.delete(k)
    }

    const scopes = this.config.scopes ?? ['openid', 'profile', 'email']
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: scopes.join(' '),
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    })

    return { url: `${disc.authorization_endpoint}?${params}`, state }
  }

  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ claims: UserInfoClaims, role: UserRole }> {
    const pkce = pkceStates.get(state)
    if (!pkce)
      throw new Error('Invalid or expired OAuth state parameter')
    pkceStates.delete(state)

    const disc = await this.getDiscovery()

    const tokenRes = await fetch(disc.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: this.config.redirectUri,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code_verifier: pkce.codeVerifier,
      }),
    })
    if (!tokenRes.ok) {
      const body = await tokenRes.text()
      throw new Error(`OIDC token exchange failed: ${body}`)
    }
    const tokens = (await tokenRes.json()) as TokenResponse

    const userInfoRes = await fetch(disc.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    })
    if (!userInfoRes.ok)
      throw new Error('Failed to fetch OIDC user info')
    const claims = (await userInfoRes.json()) as UserInfoClaims
    const role = this.mapGroupsToRole(claims)
    return { claims, role }
  }

  private mapGroupsToRole(claims: UserInfoClaims): UserRole {
    const groupsClaim = this.config.groupsClaim ?? 'groups'
    const groups = claims[groupsClaim]
    if (!this.config.groupRoleMapping || !Array.isArray(groups))
      return 'viewer'
    for (const group of groups) {
      const role = this.config.groupRoleMapping[group]
      if (role)
        return role
    }
    return 'viewer'
  }
}
