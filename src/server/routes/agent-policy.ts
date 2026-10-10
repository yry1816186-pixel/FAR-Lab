import { HttpError, sendJson, type RouteCtx, type RouteFamily } from '../http-kit.js';
import { ConversationSchema } from '../../domain/index.js';
import { getConversation, listConversations, ConversationError } from '../conversations.js';

/** Agent-policy family (BC-002): resident-agent approval posture (settings surface). */

export function registerAgentPolicyRoutes(ctx: RouteCtx): RouteFamily {
  const app = ctx.app;

  return async (req, res, url, segments) => {
    const method = req.method ?? 'GET';

    if (segments[2] !== 'agent-policy') return false;
    // Resident-agent approval posture (settings surface): the engine is
    // fail-closed by design — every tool-class action asks once per
    // conversation, and "remember" adds that action KIND to that one
    // conversation's autoApprove (bounded at 10). This endpoint makes the
    // posture visible and lets the researcher revoke remembered kinds.
    const policyRoute = (fn: () => void): void => {
      try {
        fn();
      } catch (e) {
        if (e instanceof ConversationError) {
          throw new HttpError(e.status, { code: e.code, message: e.message, retryable: false });
        }
        throw e;
      }
    };
    if (segments.length === 3 && method === 'GET') {
      policyRoute(() => {
        const remembered = listConversations(app)
          .filter((c) => c.autoApprove.length > 0)
          .map((c) => ({ conversationId: c.id, conversationTitle: c.title, kinds: c.autoApprove }));
        sendJson(res, 200, { defaultPolicy: 'ask_per_conversation', remembered });
      });
      return true;
    }
    if (segments[3] === 'remember' && segments.length === 5 && method === 'DELETE') {
      const convId = segments[4]!;
      policyRoute(() => {
        const conv = getConversation(app, convId); // 404 when unknown
        if (conv.autoApprove.length === 0) {
          sendJson(res, 200, { conversationId: convId, kinds: [] });
          return;
        }
        const updated = ConversationSchema.parse({ ...conv, autoApprove: [], updatedAt: new Date().toISOString() });
        app.store.putObject('conversation', updated);
        sendJson(res, 200, { conversationId: convId, kinds: [] });
      });
      return true;
    }
    return false; // family fallthrough: the composer 404s with the identical envelope
  };
}
