// POST /functions/v1/spin
//
// Server-authoritative counterpart to generateLocalSpin()/normalizeLocalSpin() in
// nova-casino.html. Request/response shapes here are NOT invented -- they were
// reverse-engineered from backend.requestSpin() and normalizeRemoteSpin() in
// nova-casino.html so the existing, already-shipped client code needs zero changes
// to use this once deployed.
//
// Request body: {stakeCents, sessionId, idempotencyKey, gameKey, deviceId, clientVersion}
// Response: {presentation, balanceCents, featureState, sessionId, gambleRound}
//
// Deno.serve + createClient(service role) is the standard Supabase Edge Function
// pattern: the incoming user JWT is verified via supabaseClient.auth.getUser(token)
// to get a trustworthy user id, then all business logic runs through the service
// role key so it can call the SECURITY DEFINER ledger RPC (apply_spin_result) without
// being blocked by RLS -- RLS still fully applies to anything the client queries
// directly over PostgREST.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  STAKES_CENTS,
  RISK_GAMES,
  generateServerSpin,
  nextServerFeatureState,
} from '../_shared/math.js';
import { corsHeaders, jsonResponse, errorResponse } from '../_shared/http.ts';

const KNOWN_GAMES = new Set(['shark-abyss', 'fruit-reactor', 'fancy-harvest', 'tomb-of-kings']);
const MIN_CLIENT_VERSION = '6.4.0';

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
    const { stakeCents, idempotencyKey, gameKey, clientVersion } = body || {};
    if (!idempotencyKey || typeof idempotencyKey !== 'string') return errorResponse('Ungültige Anfrage.', 400);
    if (!KNOWN_GAMES.has(gameKey)) return errorResponse('Unbekanntes Spiel.', 400);
    if (clientVersion && clientVersion < MIN_CLIENT_VERSION) return errorResponse('client_update_required', 409);

    const db = createClient(supabaseUrl, serviceRoleKey);

    const { data: stateRow, error: stateError } = await db
      .from('game_states')
      .select('feature_remaining, feature_multiplier, feature_stake_cents, expanding_symbol, session_id')
      .eq('user_id', userId)
      .eq('game_key', gameKey)
      .single();
    if (stateError || !stateRow) return errorResponse('Serverfehler: Spielstatus nicht gefunden.', 500);

    const isFreeSpin = Number(stateRow.feature_remaining) > 0;
    const featureBefore = {
      remaining: stateRow.feature_remaining,
      multiplier: Number(stateRow.feature_multiplier),
      stakeCents: stateRow.feature_stake_cents,
      expandingSymbol: stateRow.expanding_symbol,
    };
    const effectiveStake = isFreeSpin ? featureBefore.stakeCents : Number(stakeCents);
    if (!isFreeSpin && !STAKES_CENTS.includes(effectiveStake)) return errorResponse('Ungültiger Einsatz.', 400);

    // Real play always uses the platform's cryptographically secure RNG (Deno's
    // global crypto, same contract as the browser's crypto.getRandomValues() the
    // client uses in guest mode) -- never Math.random(), never a seed.
    const spin = generateServerSpin({ gameKey, stakeCents: effectiveStake, isFreeSpin, featureBefore });
    const featureState = nextServerFeatureState(gameKey, featureBefore, spin);
    const holdsInGamble = RISK_GAMES.has(gameKey) && spin.totalCents > 0;

    const presentation = {
      id: spin.id, gameKey, stakeCents: effectiveStake, isFreeSpin, multiplier: spin.multiplier,
      grid: spin.grid, mystery: spin.mystery, wins: spin.wins, totalCents: spin.totalCents,
      freeSpins: spin.freeSpins, scatterCount: spin.scatterCount, nextMultiplier: spin.nextMultiplier,
      expanding: spin.expanding || null, chosenExpandingSymbol: spin.chosenExpandingSymbol || null,
    };

    const { data: result, error: rpcError } = await db.rpc('apply_spin_result', {
      p_user_id: userId,
      p_idempotency_key: idempotencyKey,
      p_game_key: gameKey,
      p_stake_cents: effectiveStake,
      p_is_free_spin: isFreeSpin,
      p_total_cents: spin.totalCents,
      p_presentation: presentation,
      p_feature_state: featureState,
      p_holds_in_gamble: holdsInGamble,
    });
    if (rpcError) {
      if (rpcError.message?.includes('insufficient_balance')) return errorResponse('insufficient_balance', 409);
      console.error(rpcError);
      return errorResponse('Spin fehlgeschlagen.', 500);
    }

    // On a fresh call this is just `presentation` again; on an idempotent replay
    // (client retried after losing the response, e.g. a reload mid-flight -- see
    // AUDIT.md B2) it is the ORIGINAL stored presentation, so a retry can never
    // present a second, different outcome for the same idempotencyKey.
    const finalPresentation = result.presentation;
    const finalFeatureState = result.featureState;

    let gambleRound = null;
    if (result.roundId) {
      gambleRound = {
        roundId: result.roundId,
        spinId: result.spinId,
        gameKey,
        initialCents: finalPresentation.totalCents,
        currentCents: finalPresentation.totalCents,
        level: 0,
        maxLevel: 5,
        status: 'active',
      };
    }

    return jsonResponse({
      presentation: finalPresentation,
      balanceCents: result.balanceCents,
      featureState: finalFeatureState,
      sessionId: stateRow.session_id,
      gambleRound,
    });
  } catch (error) {
    console.error(error);
    return errorResponse('Serverfehler.', 500);
  }
});
