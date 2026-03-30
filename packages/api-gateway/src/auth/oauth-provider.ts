import crypto from 'crypto'
import type { OAuthConfig, UserInfoClaims } from './types.js'

interface OAuthState {
  createdAt: number
}

const oauthStates = new Map<string, OAuthState>()

function purgeExpiredStates() {
  for (const [k, v] of oauthStates) {
    if (Date.now() - v.createdAt > 10 * 60 * 1000)
      oauthStates.delete(k)
  }
}

const ENDPOINTS = {
  github: {
    auth: 'https://github.com/login/oauth/authorize',
    token: 'https://github.com/login/oauth/access_token',
    userInfo: 'https://api.github.com/user',
    userEmails: 'https://api.github.com/user/emails',
  },
  google: {
    auth: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    userInfo: 'https://www.googleapis.com/oauth2/v3/userinfo',
  },
} as const

export class OAuthProvider {
  constructor(private readonly config: OAuthConfig) {}

  getAuthorizationUrl(): { url: string, state: string } {
    const state = crypto.randomBytes(16).toString('hex')
    purgeExpiredStates()
    oauthStates.set(state, { createdAt: Date.now() })

    const ep = ENDPOINTS[this.config.provider]
    const defaultScopes = this.config.provider === 'github'
      ? ['openid', 'email', 'read:user']
      : ['openid', 'email', 'profile']
    const scopes = this.config.scopes ?? defaultScopes
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: scopes.join(' '),
      state,
      response_type: 'code',
    })

    return { url: `${ep.auth}?${params}`, state }
  }

  async handleCallback(code: string, state: string): Promise<UserInfoClaims> {
    const saved = oauthStates.get(state)
    if (!saved)
      throw new Error('Invalid or expired OAuth state parameter')
    oauthStates.delete(state)

    const ep = ENDPOINTS[this.config.provider]

    const tokenRes = await fetch(ep.token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    if (!tokenRes.ok)
      throw new Error(`OAuth token exchange failed: HTTP ${tokenRes.status}`)
    const tokenData = (await tokenRes.json()) as { access_token?: string, error?: unknown }
    if (tokenData.error || !tokenData.access_token)
      throw new Error(`OAuth error: ${String(tokenData.error ?? 'no access_token returned')}`)

    const accessToken = tokenData.access_token
    const userInfoRes = await fetch(ep.userInfo, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        ...(this.config.provider === 'github' ? { 'User-Agent': 'AgentObs/1.0' } : {}),
      },
    })
    if (!userInfoRes.ok)
      throw new Error('Failed to fetch OAuth user info')
    const userInfo = (await userInfoRes.json()) as Record<string, unknown>
    return this.config.provider === 'github'
      ? this.normalizeGitHub(userInfo, accessToken)
      : this.normalizeGoogle(userInfo)
  }

  private async normalizeGitHub(
    data: Record<string, unknown>,
    accessToken: string,
  ): Promise<UserInfoClaims> {
    let email = (data['email'] as string | null) ?? null

    // GitHub may omit email in user object - fetch from emails endpoint
    if (!email) {
      const emailRes = await fetch(ENDPOINTS.github.userEmails, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
          'User-Agent': 'AgentObs/1.0',
        },
      })

      if (emailRes.ok) {
        const emails = (await emailRes.json()) as Array<{
          email: string
          primary: boolean
          verified: boolean
        }>
        const primary = emails.find((e) => e.primary && e.verified)
        email = primary?.email ?? emails[0]?.email ?? null
      }
    }

    return {
      sub: `github:${String(data['id'])}`,
      email: email ?? '',
      name: (data['name'] as string) || (data['login'] as string) || '',
      picture: data['avatar_url'] as string | undefined,
    }
  }

  private normalizeGoogle(data: Record<string, unknown>): UserInfoClaims {
    return {
      sub: String(data['sub']),
      email: (data['email'] as string) ?? '',
      name: (data['name'] as string) ?? '',
      picture: data['picture'] as string | undefined,
    }
  }
}
