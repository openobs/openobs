/**
 * SAML 2.0 Provider
 *
 * Full SAML support requires an external library such as `node-saml` or `samlify`.
 * This module provides the interface and SP metadata generation.
 * To enable SAML in production, install `node-saml` and replace the stub methods.
 */
import type { SamlConfig, UserInfoClaims, UserRole } from './types.js'

export class SamlProvider {
  constructor(private readonly config: SamlConfig) {}

  /**
   * Returns the URL to redirect the user to for SSO initiation.
   * Requires a SAML library to construct a proper SAMLRequest.
   */
  getAuthorizationUrl(): string {
    // TODO: Install node-saml and implement AuthnRequest construction
    throw new Error(
      'SAML SSO requires node-saml. Run: npm install node-saml --workspace=agentic-obs/api-gateway',
    )
  }

  /**
   * Processes the SAMLResponse POST from the IdP.
   * Requires a SAML library to parse and validate the XML assertion.
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async handleCallback(samlResponse: string): Promise<{ claims: UserInfoClaims, role: UserRole }> {
    // TODO: Install node-saml and implement assertion parsing + signature validation
    throw new Error(
      'SAML SSO requires node-saml. Run: npm install node-saml --workspace=agentic-obs/api-gateway',
    )
  }

  /**
   * Returns SP metadata XML for registration with the IdP (Okta, Azure AD, etc.).
   * This is safe to serve without a SAML library.
   */
  getSpMetadata(): string {
    return `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
  entityID="${this.config.issuer}">
  <SPSSODescriptor
    AuthnRequestsSigned="false"
    WantAssertionsSigned="true"
    protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <AssertionConsumerService
      Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
      Location="${this.config.callbackUrl}"
      index="1" />
  </SPSSODescriptor>
</EntityDescriptor>`
  }
}
