import {
  BadGatewayException,
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { PlatformAccess, type AccessContext } from './access.js';
import { PlatformDatabase } from './database.js';
import { sendAgentStream } from './agent-ui-stream.js';
import { checkEnvironment, conversationRequest, type TurnStream } from './create-form-agent.js';
import {
  PlatformDrafts,
  type Delivery,
  type Draft,
  digestText,
  resourceId,
} from './form-drafts.js';
import { configText, PlatformForms } from './forms.js';
import { pinAgentAssetEnvironment } from './agent-asset-environments.js';
import { ReleaseBuild } from './release-build.js';
import { requireStudioOrigin, session } from './session-http.js';

import {
  referenceIdentity,
  referenceKey,
  resolveReference,
  type ReferenceKey,
} from './agent-reference.js';

type TurnInput = {
  turnId: string;
  revision: number;
  message: string;
  document?: string;
  references?: ReferenceKey[];
  draftId?: string;
  draftRevision?: number;
  workingText?: string;
  basedOnVersionId?: string;
  assetChoices?: unknown;
  readOnly?: boolean;
  formId?: string;
  workId?: string;
};
type Reply = {
  kind: string;
  message?: string;
  questions?: string[];
  summary?: string;
  reason?: string;
};
type Conversation = {
  id: string;
  title: string;
  revision: number;
  updatedAt: string;
  turns: { turnId: string; message: string; result: Reply; draftId?: string }[];
};
type TurnResponse = { conversation: Conversation; delivery?: Delivery | null };
type TurnView = { conversation: Conversation; draft?: Draft | null; editorProposal?: Delivery };

@Controller('api/platform/agent-conversations')
export class AgentConversationsController {
  constructor(
    private readonly access: PlatformAccess,
    private readonly drafts: PlatformDrafts,
    private readonly builds: ReleaseBuild,
    private readonly assetStorage: PlatformDatabase,
    private readonly forms: PlatformForms,
    private readonly db: PlatformDatabase,
  ) {}
  private async checkForm(actor: AccessContext, formId: string, workId?: string) {
    const form = await this.forms.findForm(actor.spaceId, resourceId(formId));
    if (form.archived) throw new ConflictException('表单已归档');
    if (
      workId &&
      !(await this.db.executor.one(
        'SELECT 1 FROM platform_working_versions WHERE form_id=$1 AND work_id=$2',
        [formId, resourceId(workId)],
      ))
    )
      throw new NotFoundException();
  }
  private async authorizeReferenceRead(cookie: string, owner: AccessContext) {
    const actor = await this.access.authenticate(session(cookie), 'form:view');
    if (actor.userId !== owner.userId || actor.spaceId !== owner.spaceId)
      throw new ConflictException('会话所属空间已改变');
    return actor;
  }
  private async resolveReferences(cookie: string, owner: AccessContext, input: unknown) {
    if (input === undefined) return [];
    if (!Array.isArray(input) || input.length > 5)
      throw new BadRequestException('一条消息最多添加 5 个引用。');
    if (!input.length) return [];
    const actor = await this.authorizeReferenceRead(cookie, owner);
    const references = [];
    const seen = new Set<string>();
    let bytes = 0;
    for (const item of input) {
      const key = referenceKey(item);
      const identity = JSON.stringify(referenceIdentity(key));
      if (seen.has(identity)) throw new BadRequestException('消息引用重复。');
      seen.add(identity);
      const reference = await resolveReference(key, actor.spaceId, this.forms, this.builds);
      bytes += Buffer.byteLength(reference.text);
      if (bytes > 16 * 1024)
        throw new BadRequestException('引用内容合计过大，请移除部分引用后重试。');
      references.push(reference);
    }
    return references;
  }
  private async linkedDraft(actor: AccessContext, formId: string, workId: string) {
    const saved = await this.db.executor.one<{ id: string }>(
      'SELECT id FROM platform_form_drafts WHERE form_id=$1 AND version_id=$2 AND user_id=$3 AND space_id=$4',
      [formId, workId, actor.userId, actor.spaceId],
    );
    return saved?.id;
  }
  private async reauthorize(cookie: string, owner: AccessContext) {
    const actor = await this.access.authenticate(session(cookie), 'form:edit');
    if (actor.userId !== owner.userId || actor.spaceId !== owner.spaceId)
      throw new ConflictException('会话所属空间已改变');
    return actor;
  }
  private async conversationScope(actor: AccessContext, formId?: string, workId?: string) {
    if (workId && !formId) throw new BadRequestException();
    const query = new URLSearchParams();
    if (formId) {
      await this.checkForm(actor, formId, workId);
      query.set('formId', formId);
      if (workId) {
        query.set('workId', workId);
        const linked = await this.linkedDraft(actor, formId, workId);
        if (linked) query.set('linkedDraftId', linked);
      }
    }
    return query;
  }
  @Get()
  @Header('Cache-Control', 'no-store')
  async list(
    @Headers('cookie') cookie: string,
    @Query('formId') formId?: string,
    @Query('workId') workId?: string,
  ) {
    const actor = await this.access.authenticate(session(cookie), 'form:edit');
    return conversationRequest(actor, '', {
      query: await this.conversationScope(actor, formId, workId),
    });
  }
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  async get(
    @Headers('cookie') cookie: string,
    @Param('id') id: string,
    @Query('formId') formId?: string,
    @Query('workId') workId?: string,
  ) {
    const actor = await this.access.authenticate(session(cookie), 'form:edit');
    return conversationRequest(actor, '/' + resourceId(id), {
      query: await this.conversationScope(actor, formId, workId),
    });
  }
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  async rename(
    @Headers('origin') origin: string,
    @Headers('cookie') cookie: string,
    @Param('id') id: string,
    @Body() body: { title?: unknown },
  ) {
    requireStudioOrigin(origin);
    const actor = await this.access.authenticate(session(cookie), 'form:edit');
    const title = typeof body?.title === 'string' ? body.title.trim() : '';
    if (!title || Array.from(title).length > 60 || title.includes('\0') || /[\r\n]/u.test(title))
      throw new BadRequestException('对话标题须为 1–60 个字符的单行文本。');
    return conversationRequest<{ id: string; title: string }>(actor, '/' + resourceId(id), {
      method: 'PATCH',
      body: { title },
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @Headers('origin') origin: string,
    @Headers('cookie') cookie: string,
    @Param('id') id: string,
  ) {
    requireStudioOrigin(origin);
    await conversationRequest(
      await this.access.authenticate(session(cookie), 'form:edit'),
      '/' + resourceId(id),
      { method: 'DELETE' },
    );
  }
  private async receive(
    cookie: string,
    actor: AccessContext,
    delivery: Delivery,
    expected: { formId?: string; workId?: string; draftId?: string },
    apply = true,
    editorId?: string,
  ) {
    if (delivery.target === 'editor') {
      if (
        !delivery.formId ||
        delivery.draftIssues !== undefined ||
        (expected.formId && delivery.formId !== expected.formId) ||
        (expected.workId && delivery.workId !== expected.workId) ||
        expected.draftId
      )
        throw new BadGatewayException('Invalid editor target');
      await this.checkForm(await this.reauthorize(cookie, actor), delivery.formId, delivery.workId);
      if (digestText(configText(delivery.candidateText)) !== delivery.digest || !delivery.checkId)
        throw new BadGatewayException('Invalid editor candidate');
      return { editorProposal: delivery };
    }
    if (
      delivery.target !== 'draft' ||
      expected.formId ||
      (expected.draftId && expected.draftId !== delivery.draftId)
    )
      throw new BadGatewayException('Invalid draft target');
    return {
      draft: apply
        ? ((await this.drafts.receive(session(cookie), actor, delivery, editorId)) ?? null)
        : await this.drafts.delivered(await this.reauthorize(cookie, actor), delivery),
    };
  }
  @Get(':id/deliveries/:turnId')
  @Header('Cache-Control', 'no-store')
  async delivery(
    @Headers('cookie') cookie: string,
    @Param('id') id: string,
    @Param('turnId') turnId: string,
    @Query('formId') formId?: string,
    @Query('workId') workId?: string,
  ) {
    return this.readDelivery(cookie, id, turnId, { formId, workId }, false);
  }
  @Post(':id/deliveries/:turnId/receive')
  async receiveDelivery(
    @Headers('origin') origin: string,
    @Headers('cookie') cookie: string,
    @Param('id') id: string,
    @Param('turnId') turnId: string,
  ) {
    requireStudioOrigin(origin);
    return this.readDelivery(cookie, id, turnId, {}, true);
  }
  private async readDelivery(
    cookie: string,
    id: string,
    turnId: string,
    expected: { formId?: string; workId?: string },
    apply: boolean,
  ) {
    const actor = await this.access.authenticate(session(cookie), 'form:edit');
    const delivery = await conversationRequest<Delivery>(
      actor,
      '/' + resourceId(id) + '/deliveries/' + resourceId(turnId),
    );
    return this.receive(cookie, actor, delivery, expected, apply);
  }
  @Post(':id/turns/:turnId/resume')
  async resume(
    @Headers('origin') origin: string,
    @Headers('cookie') cookie: string,
    @Headers('accept') accept: string,
    @Param('id') id: string,
    @Param('turnId') turnId: string,
    @Res() response: Response,
  ) {
    requireStudioOrigin(origin);
    const actor = await this.access.authenticate(session(cookie), 'form:edit');
    const path = '/' + resourceId(id);
    const target = await conversationRequest<{
      formId?: string;
      workId?: string;
      attempts?: {
        turnId: string;
        draftId?: string;
        draftRevision?: number;
        status: string;
        readOnly?: boolean;
        references?: ReferenceKey[];
      }[];
    }>(actor, path);
    const attempt = target.attempts?.find((entry) => entry.turnId === turnId);
    const draftId = target.formId ? undefined : attempt?.draftId;
    if (draftId && attempt?.readOnly && attempt.status !== 'done') {
      const draft = await this.drafts.get(session(cookie), draftId);
      if (draft.formId || draft.revision !== attempt?.draftRevision)
        throw new ConflictException('草稿已更新，请重新打开。');
    }
    if (attempt?.references?.length) {
      const savedForms = attempt.references.filter((reference) => 'formId' in reference);
      if (savedForms.length) await this.resolveReferences(cookie, actor, savedForms);
      else await this.authorizeReferenceRead(cookie, actor);
    }
    if (target.formId) await this.checkForm(actor, target.formId, target.workId);
    const run = (stream?: TurnStream): Promise<TurnView> =>
      this.drafts.whileAgentEdits(
        session(cookie),
        draftId && attempt?.draftRevision && attempt.status !== 'done' && !attempt.readOnly
          ? { id: draftId, revision: attempt.draftRevision }
          : undefined,
        id,
        async (editorId) => {
          const { conversation, delivery } = await conversationRequest<TurnResponse>(
            actor,
            path + '/turns/' + resourceId(turnId) + '/resume',
            { method: 'POST', stream },
          );
          await this.reauthorize(cookie, actor);
          const turnIndex = conversation.turns.findIndex((turn) => turn.turnId === turnId);
          if (
            conversation.id !== id ||
            turnIndex < 0 ||
            (delivery &&
              (delivery.sourceRevision > turnIndex + 1 ||
                conversation.turns[delivery.sourceRevision - 1]?.turnId !== delivery.turnId))
          )
            throw new BadGatewayException('Invalid resumed conversation');
          return {
            conversation,
            ...(delivery
              ? await this.receive(cookie, actor, delivery, { ...target, draftId }, true, editorId)
              : {}),
          };
        },
      );
    if (accept?.includes('text/event-stream'))
      return sendAgentStream(
        response,
        run,
        (result) => result.conversation.turns.find((turn) => turn.turnId === turnId)!.result,
      );
    response.status(201).json(await run());
  }
  @Post(':id/turns')
  @Header('Cache-Control', 'no-store')
  async turn(
    @Headers('origin') origin: string,
    @Headers('cookie') cookie: string,
    @Param('id') id: string,
    @Headers('accept') accept: string,
    @Body() body: TurnInput,
    @Res() response: Response,
  ) {
    requireStudioOrigin(origin);
    resourceId(id);
    resourceId(body?.turnId);
    if (
      !Number.isSafeInteger(body.revision) ||
      body.revision < 0 ||
      typeof body.message !== 'string' ||
      !body.message.trim() ||
      (body.document !== undefined &&
        (typeof body.document !== 'string' || !body.document.trim())) ||
      (body.workingText !== undefined && !body.formId && !body.draftId) ||
      (body.formId && body.draftId) ||
      (body.workId && !body.formId) ||
      (body.readOnly !== undefined && typeof body.readOnly !== 'boolean') ||
      (body.draftId && (!Number.isSafeInteger(body.draftRevision) || body.draftRevision! < 1))
    )
      throw new BadRequestException('无效的会话输入');
    const actor = await this.access.authenticate(session(cookie), 'form:edit');
    const references = await this.resolveReferences(cookie, actor, body.references);
    const run = async (stream?: TurnStream): Promise<TurnView> => {
      let environment = checkEnvironment(this.builds);
      let workingText = body.workingText === undefined ? undefined : configText(body.workingText);
      let editingDraft: Pick<Draft, 'id' | 'revision'> | undefined;
      if (body.draftId) {
        let draft: Draft | undefined;
        try {
          draft = await this.drafts.get(session(cookie), body.draftId);
        } catch (e) {
          if (!(e instanceof NotFoundException)) throw e;
        }
        if (draft && !draft.formId && !body.readOnly && body.draftRevision !== undefined)
          editingDraft = { id: draft.id, revision: body.draftRevision };
        if (!draft || draft.formId || body.draftRevision !== draft.revision) {
          // A previously committed command may be retried after its own delivery changed the draft.
          const history = await conversationRequest<Conversation>(actor, '/' + id).catch(
            (error: unknown) => {
              if (error instanceof NotFoundException) return undefined;
              throw error;
            },
          );
          if (history?.turns.some((t) => t.turnId === body.turnId)) editingDraft = undefined;
          else if (!editingDraft) throw new ConflictException('草稿已更新或删除');
        } else {
          if (workingText !== undefined && workingText !== draft.text)
            throw new ConflictException('工作稿内容与草稿修订不一致，请先保存草稿');
          workingText = draft.text;
        }
      }
      let linkedDraftId = body.draftId;
      if (body.formId) {
        await this.checkForm(actor, body.formId, body.workId);
        if (body.workId) linkedDraftId = await this.linkedDraft(actor, body.formId, body.workId);
        const input = await this.forms.authoringAssetInput(
          session(cookie),
          body.formId,
          {
            text: workingText,
            basedOnVersionId: body.basedOnVersionId,
            assetChoices: body.assetChoices,
          },
          'check',
        );
        workingText = input.text;
        environment = await pinAgentAssetEnvironment(
          this.assetStorage.executor,
          this.builds,
          input.bindings,
        );
      }
      const requestFingerprint = digestText(
        JSON.stringify([
          body.revision,
          body.message,
          body.document,
          body.draftId,
          body.draftRevision,
          body.formId,
          body.workId,
          body.workingText,
          ...(body.readOnly ? ['read-only'] : []),
          ...(body.basedOnVersionId || body.assetChoices
            ? [[body.basedOnVersionId, body.assetChoices]]
            : []),
          ...(references.length ? [references.map(referenceIdentity)] : []),
        ]),
      );
      return this.drafts.whileAgentEdits(session(cookie), editingDraft, id, async (editorId) => {
        const { conversation, delivery } = await conversationRequest<TurnResponse>(
          actor,
          '/' + id + '/turns',
          {
            method: 'POST',
            stream,
            body: {
              turnId: body.turnId,
              revision: body.revision,
              message: body.message,
              document: body.document,
              ...(references.length && { references }),
              workingText,
              draftId: linkedDraftId,
              draftRevision: body.draftRevision,
              requestFingerprint,
              ...(body.readOnly ? { readOnly: true } : {}),
              context: {
                target: 'web',
                knowledge_version:
                  process.env.CREATE_FORM_KNOWLEDGE_VERSION || 'createform-l1-2026-11-22.2',
                check_environment: environment,
                formId: body.formId,
                workId: body.workId,
              },
            },
          },
        );
        await this.reauthorize(cookie, actor);
        const turn = conversation?.turns?.[body.revision];
        if (
          conversation?.id !== id ||
          turn?.turnId !== body.turnId ||
          (delivery &&
            (delivery.sourceRevision > body.revision + 1 ||
              conversation.turns[delivery.sourceRevision - 1]?.turnId !== delivery.turnId))
        )
          throw new BadGatewayException('Invalid conversation result');
        return {
          conversation,
          ...(delivery && !body.readOnly
            ? await this.receive(cookie, actor, delivery, body, true, editorId)
            : {}),
        };
      });
    };
    if (accept?.includes('text/event-stream'))
      return sendAgentStream(
        response,
        run,
        (result) => result.conversation.turns[body.revision]!.result,
      );
    response.status(201).json(await run());
  }
}
