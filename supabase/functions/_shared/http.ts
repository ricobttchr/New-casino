// Shared response helpers for the Edge Functions. Supabase Edge Functions do not add
// CORS headers by default (unlike the PostgREST/GoTrue endpoints the client also
// calls) -- without these, a browser calling /functions/v1/spin from a page that
// isn't served from the exact same origin as the Supabase project would have every
// request silently blocked by the browser's CORS check.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Matches errMessage()'s expectations in nova-casino.html: it reads data.error /
// data.code for a handful of known codes (device_conflict, client_update_required,
// maintenance, insufficient_balance, gamble_pending) and otherwise falls back to
// data.msg / data.message / data.error_description / data.error.
export function errorResponse(message: string, status = 400): Response {
  return jsonResponse({ error: message, message }, status);
}
