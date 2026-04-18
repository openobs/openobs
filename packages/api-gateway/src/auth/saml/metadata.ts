/**
 * Produce SP metadata XML for the IdP to consume.
 *
 * Uses `@node-saml/node-saml` at runtime when present; returns null otherwise
 * so the gateway can still boot. The shape is standard SAML 2.0 SP
 * descriptor XML.
 */

import type { SamlConfig } from './config.js';

export interface SamlToolkit {
  buildMetadata: () => string;
  redirectUrl: (relayState?: string) => Promise<string>;
  /** Validate POSTed SAMLResponse + return the decoded profile. */
  validatePostResponse: (
    body: Record<string, string | undefined>,
  ) => Promise<SamlProfile>;
  /** Generate a logout URL (IdP-initiated SLO). */
  logoutRedirectUrl: (nameId: string, sessionIndex?: string) => Promise<string>;
}

export interface SamlProfile {
  nameID?: string;
  attributes: Record<string, string | string[] | undefined>;
  sessionIndex?: string;
}

export async function createSamlToolkit(
  cfg: SamlConfig,
): Promise<SamlToolkit | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let lib: any;
  try {
    const mod = '@node-saml/node-saml';
    lib = await (new Function('m', 'return import(m)')(mod) as Promise<unknown>);
  } catch {
    return null;
  }
  const SAML = lib.SAML ?? lib.default?.SAML;
  if (!SAML) return null;
  // Construct the node-saml SAML instance with our config. The library's
  // option names differ from ours; map them here in one place.
  const saml = new SAML({
    issuer: cfg.issuer,
    entryPoint: cfg.entryPoint,
    callbackUrl: cfg.callbackUrl,
    idpCert: cfg.idpCert,
    privateKey: cfg.privateKey,
    signatureAlgorithm: cfg.signatureAlgorithm,
    wantAssertionsSigned: cfg.wantAssertionsSigned,
  });

  return {
    buildMetadata: (): string =>
      saml.generateServiceProviderMetadata(undefined, cfg.idpCert),
    redirectUrl: (relayState?: string) =>
      saml.getAuthorizeUrlAsync(relayState ?? '', undefined, {}),
    validatePostResponse: async (body) => {
      const out = await saml.validatePostResponseAsync(body);
      return {
        nameID: out.profile?.nameID,
        attributes: out.profile?.attributes ?? {},
        sessionIndex: out.profile?.sessionIndex,
      };
    },
    logoutRedirectUrl: async (nameId, sessionIndex) =>
      saml.getLogoutUrlAsync({ nameID: nameId, sessionIndex }, '', {}),
  };
}
