import { describe, it, expect } from 'vitest';
import { loadSamlConfig, samlEnabled } from './config.js';

describe('samlEnabled', () => {
  it('returns false when SAML_ENABLED != true', () => {
    expect(samlEnabled({} as NodeJS.ProcessEnv)).toBe(false);
    expect(samlEnabled({ SAML_ENABLED: 'false' } as NodeJS.ProcessEnv)).toBe(
      false,
    );
  });
  it('returns true when SAML_ENABLED=true', () => {
    expect(samlEnabled({ SAML_ENABLED: 'true' } as NodeJS.ProcessEnv)).toBe(
      true,
    );
  });
});

describe('loadSamlConfig', () => {
  it('returns null when disabled', () => {
    expect(loadSamlConfig({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it('returns null when required vars missing', () => {
    expect(
      loadSamlConfig({ SAML_ENABLED: 'true' } as NodeJS.ProcessEnv),
    ).toBeNull();
  });

  it('loads inline PEM cert config', () => {
    const cfg = loadSamlConfig({
      SAML_ENABLED: 'true',
      SAML_ENTRY_POINT: 'https://idp/sso',
      SAML_ISSUER: 'rounds',
      SAML_CALLBACK_URL: 'https://app/acs',
      SAML_IDP_CERT: '-----BEGIN CERT-----x-----END CERT-----',
    } as NodeJS.ProcessEnv);
    expect(cfg).not.toBeNull();
    expect(cfg!.entryPoint).toBe('https://idp/sso');
    expect(cfg!.issuer).toBe('rounds');
    expect(cfg!.attributeMapping.email).toBe('email');
    expect(cfg!.signatureAlgorithm).toBe('sha256');
    expect(cfg!.wantAssertionsSigned).toBe(true);
  });

  it('honours custom attribute mapping', () => {
    const cfg = loadSamlConfig({
      SAML_ENABLED: 'true',
      SAML_ENTRY_POINT: 'https://idp/sso',
      SAML_ISSUER: 'rounds',
      SAML_CALLBACK_URL: 'https://app/acs',
      SAML_IDP_CERT: '-----BEGIN CERT-----x-----END CERT-----',
      SAML_ATTRIBUTE_MAPPING_EMAIL: 'urn:email',
      SAML_ATTRIBUTE_MAPPING_GROUPS: 'urn:groups',
    } as NodeJS.ProcessEnv);
    expect(cfg!.attributeMapping.email).toBe('urn:email');
    expect(cfg!.attributeMapping.groups).toBe('urn:groups');
  });

  it('respects SAML_WANT_ASSERTIONS_SIGNED=false', () => {
    const cfg = loadSamlConfig({
      SAML_ENABLED: 'true',
      SAML_ENTRY_POINT: 'a',
      SAML_ISSUER: 'b',
      SAML_CALLBACK_URL: 'c',
      SAML_IDP_CERT: 'cert',
      SAML_WANT_ASSERTIONS_SIGNED: 'false',
    } as NodeJS.ProcessEnv);
    expect(cfg!.wantAssertionsSigned).toBe(false);
  });
});
