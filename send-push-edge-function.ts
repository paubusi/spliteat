// ══════════════════════════════════════════════════════
// Supabase Edge Function: send-push
// Busca suscripciones de la sala y envía push a todos
// Variables de entorno necesarias:
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY  
//   VAPID_EMAIL
//   SUPABASE_URL (automática en Supabase)
//   SUPABASE_SERVICE_ROLE_KEY (automática en Supabase)
// ══════════════════════════════════════════════════════

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const VAPID_PUBLIC_KEY  = Deno.env.get('VAPID_PUBLIC_KEY')  ?? '';
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const VAPID_EMAIL       = Deno.env.get('VAPID_EMAIL')       ?? 'mailto:hola@spliteat.es';

webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { roomId, title, body: msgBody, tag } = body;

    if (!roomId) {
      return Response.json({ error: 'roomId requerido' }, { status: 400, headers: corsHeaders });
    }

    const sb = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: subs, error } = await sb
      .from('push_subscriptions')
      .select('*')
      .eq('room_id', roomId);

    if (error) {
      return Response.json({ error: error.message }, { status: 500, headers: corsHeaders });
    }

    if (!subs || subs.length === 0) {
      return Response.json({ ok: true, sent: 0 }, { headers: corsHeaders });
    }

    const payload = JSON.stringify({
      title: title ?? 'spliteat',
      body: msgBody ?? '',
      tag: tag ?? 'spliteat'
    });

    const expiredIds = [];
    await Promise.allSettled(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload
          );
        } catch (err) {
          if (err.statusCode === 410 || err.statusCode === 404) {
            expiredIds.push(sub.id);
          }
        }
      })
    );

    if (expiredIds.length > 0) {
      await sb.from('push_subscriptions').delete().in('id', expiredIds);
    }

    return Response.json({ ok: true, sent: subs.length - expiredIds.length }, { headers: corsHeaders });

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders });
  }
});
