import {
  BadRequestException,
  Controller,
  Get,
  Header,
  Headers,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { PlatformAccess } from './access.js';
import { PlatformDatabase } from './database.js';
import { session } from './session-http.js';

const forms = `
 SELECT 'created-'||f.form_id, f.created_at, f.created_by, 'create', NULL::text,'success', '{}'::jsonb FROM platform_forms f WHERE f.form_id=$1 AND f.space_id=$2
 UNION ALL SELECT 'form-'||a.sequence,a.recorded_at,a.actor_id,a.action,NULL,'success','{}'::jsonb FROM platform_form_audit a JOIN platform_forms f USING(form_id) WHERE f.form_id=$1 AND f.space_id=$2
 UNION ALL SELECT 'release-'||r.release_id,a.recorded_at,a.actor_id,'publish',r.release_name,'success',jsonb_build_object('releaseId',r.release_id,'versionId',r.version_id,'versionName',v.version_name) FROM platform_releases r JOIN platform_forms f USING(form_id) LEFT JOIN platform_release_audit a USING(release_id) JOIN platform_versions v ON v.version_id=r.version_id AND v.form_id=f.form_id WHERE f.form_id=$1 AND f.space_id=$2`;
const members = `
 SELECT 'member-'||a.sequence,a.recorded_at,a.actor_id,
 CASE WHEN s->>'action' IN ('approve-join-request','create-account-and-member','associate-member') THEN s->>'action'
 WHEN s#>>'{before,active}' IS DISTINCT FROM s#>>'{after,active}' AND s#>>'{after,active}'='false' THEN 'deactivate'
 WHEN s#>>'{before,active}' IS DISTINCT FROM s#>>'{after,active}' AND s#>>'{after,active}'='true' THEN 'activate'
 WHEN s#>'{before,roles}' IS DISTINCT FROM s#>'{after,roles}' THEN 'roles' ELSE 'member-update' END,
 NULL::text, s->>'result',jsonb_build_object('beforeRoles',s#>'{before,roles}','afterRoles',s#>'{after,roles}','beforeActive',s#>'{before,active}','afterActive',s#>'{after,active}')
 FROM platform_member_changes a JOIN platform_members m USING(member_id) CROSS JOIN LATERAL (SELECT a.state::jsonb AS s) state WHERE m.member_id=$1 AND m.space_id=$2 AND (s->>'action') IS DISTINCT FROM 'change-password'
 UNION ALL SELECT 'decision-'||j.request_id,j.decided_at,j.decided_by,'reject-join-request',NULL,'success','{}'::jsonb
 FROM platform_members m JOIN platform_join_requests j ON j.user_id=m.user_id AND j.space_id=m.space_id
 WHERE m.member_id=$1 AND m.space_id=$2 AND j.status='rejected'`;
const security = `
 SELECT 'account-'||sequence,recorded_at,actor_id,state::jsonb->>'action','内置账号',state::jsonb->>'result','{}'::jsonb FROM platform_account_changes WHERE user_id=$1 AND state::jsonb->>'action' IN ('change-password','setup-password')
 UNION ALL SELECT 'legacy-password-'||a.sequence,a.recorded_at,a.actor_id,'change-password','内置账号',a.state::jsonb->>'result','{}'::jsonb FROM platform_member_changes a JOIN platform_members m USING(member_id) WHERE m.user_id=$1 AND a.state::jsonb->>'action'='change-password'
 UNION ALL SELECT 'bind-'||sequence,NULL,NULL,'github-bind',github_login,'success','{}'::jsonb FROM platform_github_bindings WHERE user_id=$1
 UNION ALL SELECT 'unbind-'||sequence,to_char(to_timestamp(revoked_at/1000.0) AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),NULL,'github-unbind',github_login,'success','{}'::jsonb FROM platform_github_bindings WHERE user_id=$1 AND revoked_at IS NOT NULL`;

type Filters = {
  action?: string;
  result?: string;
  from?: string;
  until?: string;
  cursor?: string;
  id?: string;
};
@Controller('api/platform')
export class OperationRecordsController {
  constructor(
    private readonly access: PlatformAccess,
    private readonly storage: PlatformDatabase,
  ) {}
  private async read(source: string, params: string[], filters: Filters) {
    for (const v of Object.values(filters))
      if (typeof v !== 'string' || v.length > 512) throw new BadRequestException();
    const args: unknown[] = [...params];
    const conditions: string[] = [];
    function parameter(value: unknown) {
      args.push(value);
      return '$' + args.length;
    }
    for (const key of ['action', 'result', 'id'] as const)
      if (filters[key]) {
        const filter = key + '=' + parameter(filters[key]);
        conditions.push(
          key === 'action' && filters.action === 'roles'
            ? '(' +
                filter +
                " OR (action IN ('activate','deactivate') AND detail->'beforeRoles' IS DISTINCT FROM detail->'afterRoles'))"
            : filter,
        );
      }
    for (const [key, operator] of [
      ['from', '>='],
      ['until', '<'],
    ] as const)
      if (filters[key]) {
        const d = new Date(filters[key]);
        if (!Number.isFinite(d.getTime())) throw new BadRequestException();
        conditions.push('at ' + operator + ' ' + parameter(d.toISOString()));
      }
    if (filters.cursor) {
      try {
        const pair: unknown = JSON.parse(Buffer.from(filters.cursor, 'base64url').toString());
        if (!Array.isArray(pair) || pair.length !== 2 || pair.some((v) => typeof v !== 'string'))
          throw Error();
        conditions.push(
          "(coalesce(at,''),id)<(" + parameter(pair[0]) + ',' + parameter(pair[1]) + ')',
        );
      } catch {
        throw new BadRequestException();
      }
    }
    const rows = await this.storage.executor.many(
      `WITH records(id,at,actor_id,action,object,result,detail) AS (${source})
   SELECT id,at,action,object,result,detail,coalesce(c.username,(SELECT '@'||b.github_login FROM platform_github_bindings b WHERE b.user_id=records.actor_id AND revoked_at IS NULL),actor_id) AS actor
   FROM records LEFT JOIN platform_credentials c ON c.user_id=records.actor_id ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''} ORDER BY coalesce(at,'') DESC,id DESC LIMIT 21`,
      args,
    );
    const page = rows.slice(0, 20);
    const last = page.at(-1);
    return {
      rows: page,
      next:
        rows.length > 20 && last
          ? Buffer.from(JSON.stringify([last.at ?? '', last.id])).toString('base64url')
          : null,
    };
  }
  @Get('forms/:id/operations')
  @Header('Cache-Control', 'no-store')
  async form(
    @Headers('cookie') cookie: string,
    @Param('id') id: string,
    @Query() filters: Filters,
  ) {
    const { spaceId } = await this.access.authenticate(session(cookie), 'form:manage');
    if (
      !(await this.storage.executor.one(
        'SELECT 1 FROM platform_forms WHERE form_id=$1 AND space_id=$2',
        [id, spaceId],
      ))
    )
      throw new NotFoundException();
    return this.read(forms, [id, spaceId], filters);
  }
  @Get('members/:id/operations')
  @Header('Cache-Control', 'no-store')
  async member(
    @Headers('cookie') cookie: string,
    @Param('id') id: string,
    @Query() filters: Filters,
  ) {
    const { spaceId } = await this.access.authenticate(session(cookie), 'member:manage');
    if (
      !(await this.storage.executor.one(
        'SELECT 1 FROM platform_members WHERE member_id=$1 AND space_id=$2',
        [id, spaceId],
      ))
    )
      throw new NotFoundException();
    return this.read(members, [id, spaceId], filters);
  }
  @Get('account/operations')
  @Header('Cache-Control', 'no-store')
  async personal(@Headers('cookie') cookie: string, @Query() filters: Filters) {
    const { userId } = await this.access.account(session(cookie));
    return this.read(security, [userId], filters);
  }
}
