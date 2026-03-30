export type AuthProviderType = 'oidc' | 'saml' | 'github' | 'google' | 'local'

export type UserRole = 'admin' | 'operator' | 'investigator' | 'viewer' | 'readonly'

export type TeamMemberRole = 'owner' | 'member'

export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string
  authProvider: AuthProviderType
  externalId?: string // IdP sub / nameID
  role: UserRole
  teams: string[]
  lastLoginAt: string
  createdAt: string
  disabled?: boolean
  passwordHash?: string // Only for local auth - never expose in API responses
}

export interface Team {
  id: string
  name: string
  members: { userId: string, role: TeamMemberRole }[]
  permissions: string[] // resource:action scopes
  createdAt: string
}

export interface Session {
  id: string
  userId: string
  accessToken: string
  refreshToken: string
  expiresAt: number // Unix epoch ms
  createdAt: number
  ipAddress?: string
  userAgent?: string
}

export interface OidcConfig {
  issuer: string
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
  groupsClaim?: string // JWT claim containing group memberships (default: "groups")
  groupRoleMapping?: Record<string, UserRole> // group name -> role
}

export interface SamlConfig {
  endpoint?: string // IdP SSO URL
  issuer: string // SP entity ID
  cert: string // IdP signing certificate (PEM)
  callbackUrl: string
  attributeMapping?: {
    email?: string
    name?: string
    groups?: string
  }
  groupRoleMapping?: Record<string, UserRole>
}

export interface OAuthConfig {
  provider: 'github' | 'google'
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export interface LocalConfig {
  enabled: boolean
}

export interface AuthProviderConfig {
  oidc?: OidcConfig
  saml?: SamlConfig
  github?: OAuthConfig
  google?: OAuthConfig
  local?: LocalConfig
  defaultRole?: UserRole
}

export interface OidcDiscovery {
  authorization_endpoint: string
  token_endpoint: string
  userinfo_endpoint: string
  jwks_uri: string
  end_session_endpoint?: string
}

export interface TokenResponse {
  access_token: string
  id_token?: string
  refresh_token?: string
  token_type: string
  expires_in?: number
}

export interface UserInfoClaims {
  sub: string
  email?: string
  name?: string
  picture?: string
  groups?: string[]
  [key: string]: unknown
}

export interface AuditLogEntry {
  id: string
  timestamp: string
  action:
    | 'login'
    | 'logout'
    | 'login_failed'
    | 'user_created'
    | 'user_updated'
    | 'user_deleted'
    | 'role_changed'
    | 'team_created'
    | 'team_updated'
    | 'team_deleted'
  actorId?: string
  actorEmail?: string
  targetId?: string
  targetEmail?: string
  provider?: AuthProviderType
  ipAddress?: string
  details?: Record<string, unknown>
}
