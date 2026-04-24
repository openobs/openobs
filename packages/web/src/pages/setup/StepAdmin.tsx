import React, { useState } from 'react';
import { apiClient } from '../../api/client.js';

/**
 * Setup wizard — first-admin bootstrap.
 *
 * Wave 6 / T9.4. Shown first in the wizard when the server has no users yet.
 * On submit, POST /api/setup/admin creates the admin, seeds them into
 * `org_main` with role=Admin, and issues a session cookie so the caller is
 * logged in for the remaining wizard steps.
 *
 * Error contract:
 *   400 — validation (bad email, short password, mismatch)
 *   409 — a user already exists; the form surfaces a hint to log in
 *   429 — rate-limited; retry later (setup router has a strict limiter)
 */

export interface AdminFormState {
  email: string;
  fullName: string;
  login: string;
  password: string;
  confirm: string;
}

export interface StepAdminProps {
  onComplete: (info: { userId: string; orgId: string }) => void;
  onBack?: () => void;
}

const MIN_PASSWORD_LEN = 12;

export function validateAdminForm(form: AdminFormState): string | null {
  if (!form.email.trim()) return 'Email is required';
  const at = form.email.indexOf('@');
  if (at < 1 || at === form.email.length - 1) return 'Email must include an @ and a domain';
  if (!form.email.slice(at + 1).includes('.')) return 'Email domain is invalid';
  if (!form.fullName.trim()) return 'Full name is required';
  if (!form.login.trim()) return 'Login is required';
  if (form.password.length < MIN_PASSWORD_LEN)
    return `Password must be at least ${MIN_PASSWORD_LEN} characters`;
  if (form.password !== form.confirm) return 'Passwords do not match';
  return null;
}

export function loginFromEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '';
  // Strip non-alphanumerics (e.g., dots in local-part) so logins are URL-safe.
  return email
    .slice(0, at)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

export function StepAdmin({ onComplete, onBack }: StepAdminProps): React.ReactElement {
  const [form, setForm] = useState<AdminFormState>({
    email: '',
    fullName: '',
    login: '',
    password: '',
    confirm: '',
  });
  const [autoLogin, setAutoLogin] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setEmail = (email: string) => {
    setForm((prev) => ({
      ...prev,
      email,
      login: autoLogin ? loginFromEmail(email) : prev.login,
    }));
  };

  const handleSubmit = async () => {
    setError(null);
    const validationError = validateAdminForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiClient.post<{ userId: string; orgId: string }>(
        '/setup/admin',
        {
          email: form.email.trim(),
          name: form.fullName.trim(),
          login: form.login.trim(),
          password: form.password,
        },
      );
      if (res.error) {
        setError(res.error.message ?? 'Failed to create admin');
        setSubmitting(false);
        return;
      }
      onComplete({ userId: res.data.userId, orgId: res.data.orgId });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create admin');
      setSubmitting(false);
    }
  };

  return (
    <div className="py-4">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-on-surface mb-2">Create Administrator</h2>
        <p className="text-on-surface-variant text-sm">
          This user will be the first server admin and the owner of the default organisation.
        </p>
      </div>

      <div className="max-w-lg mx-auto space-y-4">
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface-high border border-outline-variant text-on-surface text-sm focus:ring-1 focus:ring-primary outline-none"
            placeholder="admin@example.com"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1">Full name</label>
          <input
            type="text"
            required
            value={form.fullName}
            onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-surface-high border border-outline-variant text-on-surface text-sm focus:ring-1 focus:ring-primary outline-none"
            placeholder="Jane Operator"
          />
        </div>

        <div>
          <label className="flex items-center justify-between text-xs font-semibold text-on-surface-variant mb-1">
            <span>Login</span>
            <label className="flex items-center gap-1 font-normal">
              <input
                type="checkbox"
                checked={autoLogin}
                onChange={(e) => setAutoLogin(e.target.checked)}
                className="w-3 h-3"
              />
              <span className="text-on-surface-variant">Autofill from email</span>
            </label>
          </label>
          <input
            type="text"
            required
            value={form.login}
            onChange={(e) => {
              setAutoLogin(false);
              setForm((p) => ({ ...p, login: e.target.value }));
            }}
            className="w-full px-3 py-2 rounded-lg bg-surface-high border border-outline-variant text-on-surface text-sm focus:ring-1 focus:ring-primary outline-none"
            placeholder="admin"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1">
            Password (min {MIN_PASSWORD_LEN} characters)
          </label>
          <input
            type="password"
            required
            value={form.password}
            onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-surface-high border border-outline-variant text-on-surface text-sm focus:ring-1 focus:ring-primary outline-none"
            autoComplete="new-password"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-on-surface-variant mb-1">Confirm password</label>
          <input
            type="password"
            required
            value={form.confirm}
            onChange={(e) => setForm((p) => ({ ...p, confirm: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-surface-high border border-outline-variant text-on-surface text-sm focus:ring-1 focus:ring-primary outline-none"
            autoComplete="new-password"
          />
        </div>

        {error && (
          <div role="alert" className="px-3 py-2 rounded-lg bg-error/10 text-error text-sm">
            {error}
          </div>
        )}

        <div className="flex justify-between pt-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="px-5 py-2 rounded-lg text-on-surface-variant hover:text-on-surface hover:bg-surface-high text-sm"
            >
              ← Back
            </button>
          ) : <div />}
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleSubmit()}
            className="px-8 py-2 rounded-lg bg-primary text-on-primary-fixed font-semibold text-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {submitting ? 'Creating…' : 'Create Admin →'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default StepAdmin;
