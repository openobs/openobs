/**
 * Tests for the "Pending approvals from this team" section on the team
 * detail drawer (T3.2). Acceptance bullets #9 and #10 from the task brief.
 *
 * The web package doesn't pull in jsdom, so we test the pure helpers that
 * back the section (filter logic, link href, see-all label). The component
 * shell is a thin wrapper around these.
 */

import { describe, it, expect } from 'vitest';
import {
  pendingApprovalsForTeam,
  teamApprovalsSeeAllHref,
  teamApprovalsSeeAllLabel,
  type TeamApprovalRow,
} from '../Teams.js';

const rows: TeamApprovalRow[] = [
  { id: 'a1', status: 'pending', createdAt: '2026-05-03T10:00:00Z', requesterTeamId: 'platform', action: { type: 'ops.run_command' } },
  { id: 'a2', status: 'pending', createdAt: '2026-05-03T11:00:00Z', requesterTeamId: 'platform' },
  { id: 'a3', status: 'approved', createdAt: '2026-05-03T11:00:00Z', requesterTeamId: 'platform' },
  { id: 'a4', status: 'pending', createdAt: '2026-05-03T12:00:00Z', requesterTeamId: 'payments' },
  { id: 'a5', status: 'pending', createdAt: '2026-05-03T13:00:00Z', requesterTeamId: null },
];

describe('pendingApprovalsForTeam (acceptance #9)', () => {
  it('returns only pending rows whose requesterTeamId matches', () => {
    const out = pendingApprovalsForTeam(rows, 'platform');
    expect(out.map((r) => r.id)).toEqual(['a1', 'a2']);
  });

  it('returns empty when no rows match', () => {
    expect(pendingApprovalsForTeam(rows, 'no-such-team')).toEqual([]);
  });

  it('does not match NULL requesterTeamId by accident', () => {
    expect(pendingApprovalsForTeam(rows, '')).toEqual([]);
  });
});

describe('teamApprovalsSeeAllHref (acceptance #10)', () => {
  it('builds /actions?team=<teamId>', () => {
    expect(teamApprovalsSeeAllHref('platform')).toBe('/actions?team=platform');
  });

  it('encodes special characters in the team id', () => {
    expect(teamApprovalsSeeAllHref('team a&b')).toBe('/actions?team=team%20a%26b');
  });
});

describe('teamApprovalsSeeAllLabel', () => {
  it('drops the overflow count when total fits inside the preview', () => {
    expect(teamApprovalsSeeAllLabel(2, 5)).toBe('See all approvals from this team');
    expect(teamApprovalsSeeAllLabel(5, 5)).toBe('See all approvals from this team');
  });

  it('shows the overflow count when total exceeds the preview', () => {
    expect(teamApprovalsSeeAllLabel(8, 5)).toBe('See all (3 more) approvals from this team');
  });

  it('treats zero rows as "no overflow"', () => {
    expect(teamApprovalsSeeAllLabel(0, 5)).toBe('See all approvals from this team');
  });
});
