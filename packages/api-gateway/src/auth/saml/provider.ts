/**
 * SamlProvider — small facade exposing the four endpoints required by §08:
 *   GET  /api/saml/metadata         → metadata XML
 *   POST /api/saml/acs              → consume assertion
 *   GET  /api/saml/slo              → initiate SLO redirect
 *   POST /api/saml/slo/callback     → handle IdP's SLO response
 *
 * Instantiated at server boot via `loadSamlConfig`; disabled → provider is
 * null and routes return 501.
 */

import type { SamlConfig } from './config.js';
import { createSamlToolkit, type SamlToolkit } from './metadata.js';
import {
  consumeSamlAssertion,
  type SamlAcsDeps,
} from './acs-handler.js';

export class SamlProvider {
  private toolkit: SamlToolkit | null = null;

  constructor(
    public readonly cfg: SamlConfig,
    private readonly deps: SamlAcsDeps,
  ) {}

  async ensureToolkit(): Promise<SamlToolkit | null> {
    if (this.toolkit) return this.toolkit;
    this.toolkit = await createSamlToolkit(this.cfg);
    return this.toolkit;
  }

  async metadata(): Promise<string | null> {
    const tk = await this.ensureToolkit();
    return tk ? tk.buildMetadata() : null;
  }

  async loginRedirectUrl(relayState?: string): Promise<string | null> {
    const tk = await this.ensureToolkit();
    return tk ? tk.redirectUrl(relayState) : null;
  }

  async consumeAssertion(
    body: Record<string, string | undefined>,
  ): Promise<{ user: import('@agentic-obs/common').User; sessionIndex?: string } | null> {
    const tk = await this.ensureToolkit();
    if (!tk) return null;
    return consumeSamlAssertion(body, tk, this.cfg, this.deps);
  }

  async logoutUrl(nameId: string, sessionIndex?: string): Promise<string | null> {
    const tk = await this.ensureToolkit();
    return tk ? tk.logoutRedirectUrl(nameId, sessionIndex) : null;
  }
}
