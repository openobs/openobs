import { sql } from 'drizzle-orm';
import type { DbClient } from '../../../db/client.js';
import { pgAll, pgRun } from '../pg-helpers.js';
import type { ITeamRoleRepository } from '@agentic-obs/common';
import type { TeamRole, NewTeamRole } from '@agentic-obs/common';
import { uid, nowIso } from './shared.js';

interface Row {
  id: string;
  org_id: string;
  team_id: string;
  role_id: string;
  created: string;
}

function rowTo(r: Row): TeamRole {
  return {
    id: r.id,
    orgId: r.org_id,
    teamId: r.team_id,
    roleId: r.role_id,
    created: r.created,
  };
}

export class TeamRoleRepository implements ITeamRoleRepository {
  constructor(private readonly db: DbClient) {}

  async create(input: NewTeamRole): Promise<TeamRole> {
    const id = input.id ?? uid();
    const now = nowIso();
    await pgRun(this.db, sql`
      INSERT INTO team_role (id, org_id, team_id, role_id, created)
      VALUES (${id}, ${input.orgId}, ${input.teamId}, ${input.roleId}, ${now})
    `);
    const row = await this.findById(id);
    if (!row) throw new Error(`[TeamRoleRepository] create failed for id=${id}`);
    return row;
  }

  async findById(id: string): Promise<TeamRole | null> {
    const rows = await pgAll<Row>(this.db, sql`SELECT * FROM team_role WHERE id = ${id}`);
    return rows[0] ? rowTo(rows[0]) : null;
  }

  async listByTeam(teamId: string, orgId?: string): Promise<TeamRole[]> {
    const rows = orgId
      ? await pgAll<Row>(this.db, sql`
          SELECT * FROM team_role
          WHERE team_id = ${teamId} AND (org_id = ${orgId} OR org_id = '')
        `)
      : await pgAll<Row>(this.db, sql`SELECT * FROM team_role WHERE team_id = ${teamId}`);
    return rows.map(rowTo);
  }

  async listByTeams(teamIds: string[], orgId?: string): Promise<TeamRole[]> {
    if (teamIds.length === 0) return [];
    const placeholders = sql.join(
      teamIds.map((id) => sql`${id}`),
      sql`, `,
    );
    const rows = orgId
      ? await pgAll<Row>(this.db, sql`
          SELECT * FROM team_role
          WHERE team_id IN (${placeholders}) AND (org_id = ${orgId} OR org_id = '')
        `)
      : await pgAll<Row>(this.db,
          sql`SELECT * FROM team_role WHERE team_id IN (${placeholders})`,
        );
    return rows.map(rowTo);
  }

  async listByRole(roleId: string): Promise<TeamRole[]> {
    const rows = await pgAll<Row>(this.db, sql`SELECT * FROM team_role WHERE role_id = ${roleId}`);
    return rows.map(rowTo);
  }

  async delete(id: string): Promise<boolean> {
    const before = await this.findById(id);
    if (!before) return false;
    await pgRun(this.db, sql`DELETE FROM team_role WHERE id = ${id}`);
    return true;
  }

  async remove(orgId: string, teamId: string, roleId: string): Promise<boolean> {
    const before = await pgAll<Row>(this.db, sql`
      SELECT * FROM team_role
      WHERE org_id = ${orgId} AND team_id = ${teamId} AND role_id = ${roleId}
    `);
    if (before.length === 0) return false;
    await pgRun(this.db, sql`
      DELETE FROM team_role
      WHERE org_id = ${orgId} AND team_id = ${teamId} AND role_id = ${roleId}
    `);
    return true;
  }
}
