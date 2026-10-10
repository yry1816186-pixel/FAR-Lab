import {
  attachRunToConversation, collectConversationSeeds, createConversation, deleteConversation,
  getConversation, listConversations, postConversationMessage,
  renameConversation, resolveConversationProposal, resolveConversationReasoningRoute, retryConversationTurn,
  setConversationReasoningGear, ConversationError,
} from '../conversations.js';
import { consolidateConversationProfile } from '../../app/memory.js';
import {
  HttpError, conversationTurnStream, notFound, readJsonObject, sendJson, validation,
  type RouteCtx, type RouteFamily,
} from '../http-kit.js';

/** Conversations family (BC-002): the resident-researcher conversation surface —
 *  CRUD, streaming message turns, steering, retry, reasoning gear, launch into a
 *  run, proposal resolution and per-conversation automations. */

export function registerConversationsRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;
  const conversationTurns = ctx.conversationTurns;
  const conversationDeps = ctx.conversationDeps;
  const createRunWithSeeds = ctx.createRunWithSeeds;

  return async (req, res, url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] !== 'conversations') return false;
    const convRoute = async (fn: () => Promise<void> | void): Promise<void> => {
      try {
        await fn();
      } catch (e) {
        if (e instanceof ConversationError) {
          throw new HttpError(e.status, { code: e.code, message: e.message, retryable: e.code === 'conversation_model_failed' || e.code === 'turn_cancelled' });
        }
        throw e;
      }
    };
    if (segments.length === 3) {
      if (method === 'GET') { await convRoute(() => sendJson(res, 200, { conversations: listConversations(app) })); return true; }
      if (method === 'POST') {
        await convRoute(async () => {
          const body = await readJsonObject(req);
          sendJson(res, 201, { conversation: createConversation(app, body) });
        });
        return true;
      }
      throw notFound(`method ${method} not allowed for ${url.pathname}`);
    }
    const convId = segments[3]!;
    if (convId === undefined) throw notFound(`no route: ${method} ${url.pathname}`);
    if (segments.length === 4) {
      if (method === 'GET') { await convRoute(() => sendJson(res, 200, { conversation: getConversation(app, convId) })); return true; }
      if (method === 'PATCH') {
        await convRoute(async () => {
          const body = await readJsonObject(req);
          sendJson(res, 200, { conversation: renameConversation(app, convId, body.title) });
        });
        return true;
      }
      if (method === 'DELETE') { await convRoute(() => { deleteConversation(app, convId); sendJson(res, 200, { ok: true }); }); return true; }
      throw notFound(`method ${method} not allowed for ${url.pathname}`);
    }
    if (segments[4] === 'turns' && segments[5] === 'active' && segments[6] === 'stream' && segments.length === 7 && method === 'GET') {
      await convRoute(() => {
        getConversation(app, convId);
        conversationTurnStream(res, convId, url, ctx);
      });
      return true;
    }
    if (segments[4] === 'turns' && segments[5] === 'active' && segments[6] === 'cancel' && segments.length === 7 && method === 'POST') {
      await convRoute(() => {
        getConversation(app, convId);
        sendJson(res, 202, { requested: conversationTurns.cancel(convId) });
      });
      return true;
    }
    // FA-HAR-05 production steer path: queue a mid-turn redirect for the
    // running turn (consumed by the kernel loop between turns). Posting a
    // NEW message stays 409 turn_in_flight — steering is an explicit act.
    if (segments[4] === 'steer' && segments.length === 5 && method === 'POST') {
      await convRoute(async () => {
        const body = await readJsonObject(req);
        if (typeof body.text !== 'string' || body.text.trim().length === 0) {
          throw new ConversationError(400, 'validation', 'field "text" is required (non-empty)');
        }
        getConversation(app, convId);
        const queued = conversationTurns.steer(convId, body.text.trim().slice(0, 20_000));
        if (!queued) throw new ConversationError(409, 'no_active_turn', 'no turn is running for this conversation — post a message instead');
        sendJson(res, 202, { steered: true });
      });
      return true;
    }
    if (segments[4] === 'messages' && segments[5] === 'stream' && segments.length === 6 && method === 'POST') {
      await convRoute(async () => {
        const body = await readJsonObject(req);
        if (typeof body.text !== 'string' || body.text.trim().length === 0) {
          throw new ConversationError(400, 'validation', 'field "text" is required (non-empty)');
        }
        getConversation(app, convId);
        conversationTurns.start(
          convId,
          (runtime) => postConversationMessage(app, convId, body, conversationDeps, runtime),
        );
        conversationTurnStream(res, convId, url, ctx);
      });
      return true;
    }
    if (segments[4] === 'messages' && segments.length === 8 && segments[6] === 'retry' && segments[7] === 'stream' && method === 'POST') {
      await convRoute(async () => {
        // Consume/validate the JSON body before switching protocols; clients
        // send {} so the same CSRF/content-type guard applies as other writes.
        await readJsonObject(req);
        getConversation(app, convId);
        conversationTurns.start(
          convId,
          (runtime) => retryConversationTurn(app, convId, segments[5]!, conversationDeps, runtime),
        );
        conversationTurnStream(res, convId, url, ctx);
      });
      return true;
    }
    if (segments[4] === 'messages' && segments.length === 5 && method === 'POST') {
      await convRoute(async () => {
        const body = await readJsonObject(req);
        sendJson(res, 200, { conversation: await postConversationMessage(app, convId, body, conversationDeps) });
      });
      return true;
    }
    // retry re-runs the agent reply for the last (unanswered) researcher message
    if (segments[4] === 'messages' && segments.length === 7 && segments[6] === 'retry' && method === 'POST') {
      await convRoute(async () => {
        sendJson(res, 200, { conversation: await retryConversationTurn(app, convId, segments[5]!, conversationDeps) });
      });
      return true;
    }
    if (segments[4] === 'reasoning-gear' && segments.length === 5 && method === 'PUT') {
      await convRoute(async () => {
        const body = await readJsonObject(req);
        const updated = setConversationReasoningGear(app, convId, body.gear);
        sendJson(res, 200, { reasoningGear: updated.reasoningGear ?? null });
      });
      return true;
    }
    if (segments[4] === 'reasoning-gear' && segments.length === 5 && method === 'GET') {
      await convRoute(() => {
        const conv = getConversation(app, convId);
        const route = resolveConversationReasoningRoute(app, conv);
        if (route === null) { sendJson(res, 200, { supported: false }); return; }
        sendJson(res, 200, {
          supported: true,
          style: route.style,
          defaultGear: route.defaultGear,
          gear: conv.reasoningGear ?? null,
          effectiveGear: conv.reasoningGear ?? route.defaultGear,
        });
      });
      return true;
    }
    if (segments[4] === 'launch' && segments.length === 5 && method === 'POST') {
      await convRoute(async () => {
        const body = await readJsonObject(req);
        const text = typeof body.text === 'string' ? body.text.trim() : '';
        if (text.length === 0) throw validation('field "text" is required (the crystallized research question)');
        // All researcher materials from the conversation travel with the run.
        const conv = getConversation(app, convId);
        const runId = await createRunWithSeeds({
          text,
          ...(typeof body.providerConfigId === 'string' ? { providerConfigId: body.providerConfigId } : {}),
          seeds: collectConversationSeeds(conv),
        });
        attachRunToConversation(app, convId, runId);
        sendJson(res, 202, { runId });
      });
      return true;
    }
    if (segments[4] === 'proposals' && segments.length === 6 && method === 'POST') {
      await convRoute(async () => {
        const proposalId = segments[5]!;
        if (!/^act_[a-z0-9]+$/.test(proposalId)) throw validation('invalid proposal id');
        const body = await readJsonObject(req);
        if (typeof body.approve !== 'boolean') throw validation('field "approve" must be a boolean');
        const conversation = await resolveConversationProposal(
          app, convId, proposalId,
          { approve: body.approve, remember: body.remember === true },
          conversationDeps,
        );
        // RU-1 profile writer: researcher preferences derive deterministically
        // from the (now updated) proposal resolutions. Non-fatal by design — a
        // memory hiccup must never invalidate an approval; visible in server logs.
        try {
          consolidateConversationProfile(app.store, conversation); // store-typed Conversation satisfies the structural param
        } catch (e) {
          process.stderr.write(`far-server: profile consolidation failed after proposal ${proposalId}: ${e instanceof Error ? e.message : String(e)}\n`);
        }
        sendJson(res, 200, { conversation });
      });
      return true;
    }
    if (segments[4] === 'automations' && segments.length === 5 && method === 'GET') {
      await convRoute(() => {
        getConversation(app, convId); // 404 when the conversation does not exist
        const automations = app.store.listObjects('automation', '__none__')
          .filter((a) => a.conversationId === convId)
          .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
        sendJson(res, 200, { automations });
      });
      return true;
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
