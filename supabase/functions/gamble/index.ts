// POST /functions/v1/gamble
//
// Server-authoritative counterpart to resolveLocalGamble() in nova-casino.html.
// Request/response shape reverse-engineered from backend.resolveGamble() and
// executeGamble()/normalizeGamble() in nova-casino.html.
//
// Request body: {roundId, action, choice, idempotencyKey, deviceId, clientVersion}
// Response: {status, currentCents, level, card, won, balanceCents}
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveGambleStep } from '../_shared/math.js';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/http.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('method_not_allowed', 405);

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return errorResponse('Bitte zuerst anmelden.', 401);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonForAuth = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!);
    const { data: userData, error: userError } = await anonForAuth.auth.getUser(token);
    if (userError || !userData?.user) return errorResponse('Bitte zuerst anmelden.', 401);
    const userId = userData.user.id;

    const body = await req.json().catch(() => ({}));
    const { roundId, action, choice, idempotencyKey } = body || {};
    if (!roundId || !idempotencyKey) return errorResponse('Ungültige Anfrage.', 400);
    if (!['collect', 'risk'].includes(action)) return errorResponse('Ungültige Aktion.', 400);
    if (action === 'risk' && !['red', 'black', 'ladder'].includes(choice)) return errorResponse('Ungültige Wahl.', 400);

    const db = createClient(supabaseUrl, serviceRoleKey);

    const { data: round, error: roundError } = await db
      .from('gamble_rounds')
      .select('level, max_level, current_cents, status')
      .eq('id', roundId)
      .eq('user_id', userId)
      .single();
    if (roundError || !round) return errorResponse('Risikorunde nicht gefunden.', 404);

    // Deliberately no "round.status !== 'active'" bail-out here: apply_gamble_action()
    // checks its own idempotency ledger FIRST, before ever looking at round status, so
    // a retried request with the SAME idempotencyKey against an already-resolved round
    // must still succeed and replay the original result -- rejecting it here on status
    // alone would break exactly the retry-after-lost-response case idempotency exists
    // for. A genuinely new action against a non-active round is still safely rejected
    // (gamble_pending) by the RPC itself, just one step later than this would have been.
    // Real play always uses the platform's cryptographically secure RNG -- same rule
    // as the spin function, never a seed, never Math.random(). If this call turns out
    // to be a replay, the RPC discards this freshly-drawn step in favor of the cached
    // original result, so drawing it here even for a resolved round is wasteful but
    // never incorrect.
    const step = resolveGambleStep(
      { level: round.level, maxLevel: round.max_level, currentCents: round.current_cents },
      action,
      choice,
    );

    const { data: result, error: rpcError } = await db.rpc('apply_gamble_action', {
      p_user_id: userId,
      p_round_id: roundId,
      p_idempotency_key: idempotencyKey,
      p_action: action,
      p_result: step,
    });
    if (rpcError) {
      if (rpcError.message?.includes('gamble_pending')) return errorResponse('gamble_pending', 409);
      console.error(rpcError);
      return errorResponse('Risiko fehlgeschlagen.', 500);
    }

    return jsonResponse({
      status: result.status,
      currentCents: result.currentCents,
      level: result.level,
      card: result.card,
      won: result.won,
      balanceCents: result.balanceCents,
    });
  } catch (error) {
    console.error(error);
    return errorResponse('Serverfehler.', 500);
  }
});
