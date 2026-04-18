/**
 * SAML config loader.
 *
 * Enabled when `SAML_ENABLED=true` AND required env vars are present. Cert /
 * private-key fields accept either inline PEM or a path (starts with `/` or
 * `./`) which is read from disk.
 *
 * See docs/auth-perm-design/02-authentication.md §saml-provider.
 */

import { readFileSync, existsSync } from 'node:fs';

export interface SamlAttributeMapping {
  login: string;
  email: string;
  name: string;
  groups: string;
}

export interface SamlConfig {
  entryPoint: string;
  issuer: string;
  callbackUrl: string;
  idpCert: string;
  privateKey?: string | undefined;
  signatureAlgorithm: 'sha256' | 'sha512';
  wantAssertionsSigned: boolean;
  attributeMapping: SamlAttributeMapping;
}

export function samlEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env['SAML_ENABLED'] === 'true';
}

function resolveMaybePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if ((value.startsWith('/') || value.startsWith('./')) && existsSync(value)) {
    return readFileSync(value, 'utf-8');
  }
  return value;
}

export function loadSamlConfig(
  env: NodeJS.ProcessEnv = process.env,
): SamlConfig | null {
  if (!samlEnabled(env)) return null;
  const entryPoint = env['SAML_ENTRY_POINT'];
  const issuer = env['SAML_ISSUER'];
  const callbackUrl = env['SAML_CALLBACK_URL'];
  const idpCert = resolveMaybePath(env['SAML_IDP_CERT']);
  const privateKey = resolveMaybePath(env['SAML_PRIVATE_KEY']);
  if (!entryPoint || !issuer || !callbackUrl || !idpCert) return null;

  return {
    entryPoint,
    issuer,
    callbackUrl,
    idpCert,
    privateKey,
    signatureAlgorithm:
      (env['SAML_SIGNATURE_ALGORITHM'] as 'sha256' | 'sha512') || 'sha256',
    wantAssertionsSigned: env['SAML_WANT_ASSERTIONS_SIGNED'] !== 'false',
    attributeMapping: {
      login: env['SAML_ATTRIBUTE_MAPPING_LOGIN'] || 'NameID',
      email: env['SAML_ATTRIBUTE_MAPPING_EMAIL'] || 'email',
      name: env['SAML_ATTRIBUTE_MAPPING_NAME'] || 'displayName',
      groups: env['SAML_ATTRIBUTE_MAPPING_GROUPS'] || 'groups',
    },
  };
}
