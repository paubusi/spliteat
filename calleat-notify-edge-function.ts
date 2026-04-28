// supabase/functions/calleat-notify/index.ts
//
// Envía un mensaje de WhatsApp o SMS via Twilio cuando la mesa
// está lista. Llamado desde manageat al pulsar "Llamar".
//
// REQUISITOS:
// - Cuenta Twilio activa (twilio.com)
// - WhatsApp Business sender aprobado (para production; sandbox vale para dev)
// - Variables de entorno en Supabase:
//     TWILIO_ACCOUNT_SID
//     TWILIO_AUTH_TOKEN
//     TWILIO_WHATSAPP_FROM   ej. "whatsapp:+14155238886" (sandbox) o tu número aprobado
//     TWILIO_SMS_FROM         ej. "+34911234567" (un número Twilio)
//
// Despliegue:
//   supabase functions deploy calleat-notify --no-verify-jwt
//   supabase secrets set TWILIO_ACCOUNT_SID=ACxxxxx TWILIO_AUTH_TOKEN=xxxxx \
//                       TWILIO_WHATSAPP_FROM=whatsapp:+14155238886 \
//                       TWILIO_SMS_FROM=+34911234567

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CalleatNotifyPayload {
  entryId: string;
  phone: string;            // E.164: +34612345678
  method: "whatsapp" | "sms";
  name: string;             // Nombre del cliente
  tableLabel: string;       // ej. "Mesa 5"
  restaurantName: string;
  minutes?: number;         // Minutos para llegar (default 10)
}

function buildMessage(p: CalleatNotifyPayload): string {
  const m = p.minutes ?? 10;
  return `¡Hola ${p.name}! 🪑\n\nTu mesa en ${p.restaurantName} está lista: ${p.tableLabel}.\n\nTienes ${m} minutos para llegar a la entrada. ¡Te esperamos!\n\n— Aviso enviado por spliteat`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const payload = await req.json() as CalleatNotifyPayload;
    if (!payload.phone || !payload.method || !payload.name || !payload.tableLabel) {
      return new Response(JSON.stringify({ error: "Faltan campos obligatorios" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const sid   = Deno.env.get("TWILIO_ACCOUNT_SID");
    const token = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!sid || !token) {
      return new Response(JSON.stringify({ error: "Twilio no configurado" }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Origen + destino según método
    let from: string | undefined;
    let to: string;
    if (payload.method === "whatsapp") {
      from = Deno.env.get("TWILIO_WHATSAPP_FROM"); // ej. "whatsapp:+14155238886"
      to = `whatsapp:${payload.phone}`;
    } else {
      from = Deno.env.get("TWILIO_SMS_FROM");
      to = payload.phone;
    }
    if (!from) {
      return new Response(JSON.stringify({ error: `Twilio FROM no configurado para ${payload.method}` }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = buildMessage(payload);
    const form = new URLSearchParams({ From: from, To: to, Body: body });
    const auth = btoa(`${sid}:${token}`);
    const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    const data = await r.json();
    if (!r.ok) {
      return new Response(JSON.stringify({
        error: data?.message || "Twilio error",
        twilio_code: data?.code,
      }), { status: 502, headers: { ...cors, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({
      ok: true,
      sid: data.sid,
      status: data.status,
    }), { headers: { ...cors, "Content-Type": "application/json" } });

  } catch (err) {
    return new Response(JSON.stringify({
      error: (err as Error).message || "Internal error",
    }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
