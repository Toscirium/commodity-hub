// Live AIS vessel tracking for major commodity shipping chokepoints, via
// AISStream.io (wss://stream.aisstream.io/v0/stream). Designed to run on a
// 1-minute pg_cron schedule -- see docs/VESSEL_TRACKING_SETUP.md.
//
// AISStream explicitly forbids connecting straight from a browser ("proxy
// only the information your clients need from your own server"), and caps
// accounts at 3 open connections -- so this function opens exactly one
// connection per invocation, listens for a bounded window, and closes it
// before returning. pg_cron firing every 60s with a run window under that
// guarantees at most one connection open at a time.
//
// Modelled on the general approach (subscribe, decode PositionReport /
// ShipStaticData envelopes, treat everything else as noise) used by
// https://github.com/bilawalsidhu/gods-eye-view's AIS layer, adapted to this
// project's cron-writes-a-table-then-frontend-reads-it pattern (matches
// fetch-cot-report / fetch-fundamentals) instead of a persistent
// browser-facing relay -- Supabase Edge Functions don't stay warm long
// enough to hold a 24/7 upstream socket, and AISStream's own connection caps
// make "one socket per viewer" a non-starter anyway.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { corsHeaders, EdgeLogger } from '../_shared/utils.ts';

const AISSTREAM_URL = 'wss://stream.aisstream.io/v0/stream';
// Leaves a margin inside the 60s cron cadence for connect time, message
// draining after close, and the upsert itself.
const RUN_WINDOW_MS = 42_000;
const HARD_TIMEOUT_MS = RUN_WINDOW_MS + 8_000;
// A subscription with zero replies inside this long is almost certainly a
// bad API key or an AISStream outage -- bail instead of holding the socket
// open uselessly for the full window.
const FIRST_MESSAGE_TIMEOUT_MS = 15_000;

// Bounding boxes for the maritime chokepoints that actually matter to
// commodity flows -- oil/LNG transit points plus one major US export/import
// gateway. [[latMin, lonMin], [latMax, lonMax]]. Keep this in sync with the
// CHOKEPOINTS list drawn on the map in src/pages/VesselTracker.tsx.
const CHOKEPOINTS: { region: string; box: [[number, number], [number, number]] }[] = [
  { region: 'Strait of Hormuz', box: [[25.5, 55.0], [27.2, 57.0]] },
  { region: 'Bab-el-Mandeb', box: [[12.2, 43.0], [13.5, 44.0]] },
  { region: 'Suez Canal', box: [[29.7, 32.2], [31.5, 32.6]] },
  { region: 'Strait of Malacca & Singapore', box: [[1.0, 98.0], [6.5, 104.5]] },
  { region: 'Panama Canal', box: [[8.8, -80.1], [9.4, -79.4]] },
  { region: 'Bosphorus', box: [[40.9, 28.8], [41.3, 29.2]] },
  { region: 'Strait of Gibraltar', box: [[35.7, -5.8], [36.1, -5.2]] },
  { region: 'US Gulf Coast', box: [[28.3, -95.5], [29.9, -93.3]] },
];

const regionForCoords = (lat: number, lon: number): string => {
  for (const { region, box } of CHOKEPOINTS) {
    const [[latMin, lonMin], [latMax, lonMax]] = box;
    if (lat >= latMin && lat <= latMax && lon >= lonMin && lon <= lonMax) return region;
  }
  return 'other';
};

const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// Loosely typed on purpose -- this is a third-party wire format and the
// parsing below reads a handful of fields from it defensively rather than
// validating it as a strict contract.
interface AisEnvelope {
  MessageType?: string;
  error?: string;
  MetaData?: Record<string, unknown>;
  Metadata?: Record<string, unknown>;
  Message?: Record<string, Record<string, unknown>>;
}

interface PositionRow {
  mmsi: number;
  region: string;
  lat: number;
  lon: number;
  sog: number | null;
  cog: number | null;
  true_heading: number | null;
  nav_status: number | null;
  updated_at: string;
}

interface StaticRow {
  mmsi: number;
  region: string;
  lat: number;
  lon: number;
  ship_name: string | null;
  ship_type: number | null;
  destination: string | null;
  updated_at: string;
}

// AISStream's "not available" sentinels per the AIS spec -- store as null
// rather than a misleading 511°/127kn heading on the map.
const cleanHeading = (v: unknown) => (isFiniteNum(v) && v >= 0 && v <= 359 ? v : null);
const cleanNum = (v: unknown) => (isFiniteNum(v) ? v : null);
const cleanText = (v: unknown) => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
};

async function collectVesselData(apiKey: string, logger: EdgeLogger) {
  const positions = new Map<number, PositionRow>();
  const statics = new Map<number, StaticRow>();
  let messageCount = 0;

  await new Promise<void>((resolve) => {
    let settled = false;
    let firstMessageTimer: ReturnType<typeof setTimeout> | undefined;
    let windowTimer: ReturnType<typeof setTimeout> | undefined;
    const hardTimer = setTimeout(() => finish('hard_timeout'), HARD_TIMEOUT_MS);

    function finish(reason: string) {
      if (settled) return;
      settled = true;
      clearTimeout(firstMessageTimer);
      clearTimeout(windowTimer);
      clearTimeout(hardTimer);
      logger.info(`AISStream session ended (${reason}), ${messageCount} messages`);
      try { socket.close(); } catch { /* already closed */ }
      resolve();
    }

    let socket: WebSocket;
    try {
      socket = new WebSocket(AISSTREAM_URL);
    } catch (err) {
      logger.error('WebSocket construction failed', err);
      finish('construct_error');
      return;
    }

    socket.onopen = () => {
      socket.send(JSON.stringify({
        APIKey: apiKey,
        BoundingBoxes: CHOKEPOINTS.map((c) => c.box),
        FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
      }));
      firstMessageTimer = setTimeout(() => finish('no_messages'), FIRST_MESSAGE_TIMEOUT_MS);
      windowTimer = setTimeout(() => finish('window_elapsed'), RUN_WINDOW_MS);
    };

    socket.onmessage = (event) => {
      clearTimeout(firstMessageTimer);
      let envelope: AisEnvelope;
      try {
        envelope = JSON.parse(typeof event.data === 'string' ? event.data : '');
      } catch {
        return;
      }
      if (envelope?.error) {
        logger.error('AISStream rejected subscription', envelope.error);
        finish('subscription_error');
        return;
      }
      const messageType = envelope?.MessageType;
      if (messageType !== 'PositionReport' && messageType !== 'ShipStaticData') return;

      const meta = envelope.MetaData ?? envelope.Metadata ?? {};
      const body = envelope.Message?.[messageType];
      if (!body) return;

      const mmsiRaw = meta.MMSI ?? meta.UserID ?? body.UserID ?? body.UserId ?? body.Mmsi;
      const mmsi = typeof mmsiRaw === 'number' ? mmsiRaw : Number.parseInt(String(mmsiRaw ?? ''), 10);
      const lat = meta.Latitude ?? meta.latitude;
      const lon = meta.Longitude ?? meta.longitude;
      if (!Number.isFinite(mmsi) || !isFiniteNum(lat) || !isFiniteNum(lon)) return;

      messageCount += 1;
      const region = regionForCoords(lat, lon);
      const updated_at = new Date().toISOString();

      if (messageType === 'PositionReport') {
        positions.set(mmsi, {
          mmsi, region, lat, lon,
          sog: cleanNum(body.Sog),
          cog: cleanHeading(body.Cog),
          true_heading: cleanHeading(body.TrueHeading),
          nav_status: cleanNum(body.NavigationalStatus ?? body.NavStatus),
          updated_at,
        });
      } else {
        statics.set(mmsi, {
          mmsi, region, lat, lon,
          ship_name: cleanText(body.ShipName ?? meta.ShipName),
          ship_type: cleanNum(body.Type),
          destination: cleanText(body.Destination),
          updated_at,
        });
      }
    };

    socket.onerror = (event) => {
      logger.warn('AISStream socket error', (event as ErrorEvent)?.message ?? 'unknown');
    };
    socket.onclose = () => finish('socket_closed');
  });

  return { positions: [...positions.values()], statics: [...statics.values()], messageCount };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const logger = new EdgeLogger({ functionName: 'fetch-vessel-positions' });

  // Scheduled writer only, never a public API -- same x-cron-secret /
  // service-role pattern as fetch-cot-report and fetch-fundamentals.
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const authorization = req.headers.get('authorization') ?? '';
  const suppliedCronSecret = req.headers.get('x-cron-secret') ?? '';
  if (!((serviceKey && authorization === `Bearer ${serviceKey}`) ||
        (cronSecret && suppliedCronSecret === cronSecret))) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const apiKey = Deno.env.get('AISSTREAM_API_KEY') ?? '';
  if (!apiKey) {
    logger.error('AISSTREAM_API_KEY is not set');
    return new Response(JSON.stringify({ error: 'missing_api_key' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { positions, statics, messageCount } = await collectVesselData(apiKey, logger);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let positionUpserts = 0;
    let staticUpserts = 0;

    if (positions.length > 0) {
      const { error } = await supabase.from('vessel_positions')
        .upsert(positions, { onConflict: 'mmsi', ignoreDuplicates: false });
      if (error) logger.warn('Position upsert failed', error.message);
      else positionUpserts = positions.length;
    }
    if (statics.length > 0) {
      const { error } = await supabase.from('vessel_positions')
        .upsert(statics, { onConflict: 'mmsi', ignoreDuplicates: false });
      if (error) logger.warn('Static-data upsert failed', error.message);
      else staticUpserts = statics.length;
    }

    // Housekeeping: a vessel that transited a chokepoint once and never came
    // back would otherwise sit in the table forever with an increasingly
    // stale position. 48h is generous relative to how long a ship might
    // linger (e.g. anchored waiting for a Suez convoy slot) while still
    // keeping the table bounded.
    const { error: cleanupError, count } = await supabase.from('vessel_positions')
      .delete({ count: 'exact' })
      .lt('updated_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());
    if (cleanupError) logger.warn('Stale-row cleanup failed', cleanupError.message);

    logger.info(`Done: ${messageCount} messages, ${positionUpserts} position rows, ${staticUpserts} static rows, ${count ?? 0} stale rows removed`);
    return new Response(JSON.stringify({
      ok: true, messageCount, positionUpserts, staticUpserts, staleRemoved: count ?? 0,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    logger.error('fetch-vessel-positions failed', err);
    return new Response(JSON.stringify({ error: 'fetch_failed' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
