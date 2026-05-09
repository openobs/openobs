/**
 * SAML Assertion Consumer Service (ACS) — turn an IdP POSTback into an
 * Rounds identity. Validation (signature, audience, expiry) is delegated to
 * `@node-saml/node-saml`; we map attributes + call `resolveIdentity`.
 */

import type {
  IUserAuthRepository,
  IUserRepository,
  User,
} from '@agentic-obs/common';
import { AuthError } from '@agentic-obs/common';
import type { SamlConfig } from './config.js';
import type { SamlProfile, SamlToolkit } from './metadata.js';

export interface SamlAcsDeps {
  users: IUserRepository;
  userAuth: IUserAuthRepository;
  defaultOrgId: string;
}

function firstString(
  value: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value ?? undefined;
}

/** Extract the mapped attribute value from the SAML profile. */
function extract(
  profile: SamlProfile,
  key: string,
): string | undefined {
  if (key === 'NameID') return profile.nameID;
  return firstString(profile.attributes[key]);
}

export async function consumeSamlAssertion(
  rawBody: Record<string, string | undefined>,
  toolkit: SamlToolkit,
  cfg: SamlConfig,
  deps: SamlAcsDeps,
): Promise<{ user: User; sessionIndex?: string }> {
  let profile: SamlProfile;
  try {
    profile = await toolkit.validatePostResponse(rawBody);
  } catch (err) {
    throw AuthError.invalidToken(
      `saml validation failed: ${err instanceof Error ? err.message : err}`,
    );
  }

  const login = extract(profile, cfg.attributeMapping.login);
  const email = extract(profile, cfg.attributeMapping.email);
  const name = extract(profile, cfg.attributeMapping.name) ?? login ?? email;
  if (!login || !email) {
    throw AuthError.invalidCredentials();
  }
  const authId = profile.nameID ?? login;

  const existingLink = await deps.userAuth.findByAuthInfo('saml', authId);
  if (existingLink) {
    const linked = await deps.users.findById(existingLink.userId);
    if (!linked) throw AuthError.internal('saml user missing');
    return { user: linked, sessionIndex: profile.sessionIndex };
  }
  const byEmail = await deps.users.findByEmail(email);
  if (byEmail) {
    await deps.userAuth.create({
      userId: byEmail.id,
      authModule: 'saml',
      authId,
    });
    return { user: byEmail, sessionIndex: profile.sessionIndex };
  }
  const created = await deps.users.create({
    login,
    name: name ?? login,
    email,
    orgId: deps.defaultOrgId,
    emailVerified: true,
  });
  await deps.userAuth.create({
    userId: created.id,
    authModule: 'saml',
    authId,
  });
  return { user: created, sessionIndex: profile.sessionIndex };
}
