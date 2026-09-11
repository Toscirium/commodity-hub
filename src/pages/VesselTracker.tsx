import React, { useMemo, useState } from 'react';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, CircleMarker, Popup, Rectangle, useMap } from 'react-leaflet';
import { formatDistanceToNowStrict } from 'date-fns';
import { Lock, RefreshCw, Ship } from 'lucide-react';
import { Button } from '@/components/ui/button';
import PageShell from '@/components/PageShell';
import { Badge } from '@/components/ui/badge';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import PremiumPaywall from '@/components/PremiumPaywall';
import { useAuth } from '@/contexts/AuthContext';
import { useVesselPositions, type VesselPosition } from '@/hooks/useVesselPositions';
import {
  vesselCategory, navStatusLabel, VESSEL_CATEGORY_LABELS, VESSEL_CATEGORY_COLORS,
  type VesselCategory,
} from '@/utils/aisShipType';
import { cn } from '@/lib/utils';

// Kept in sync with CHOKEPOINTS in supabase/functions/fetch-vessel-positions/index.ts —
// this draws the exact boxes that function subscribes to, so "why is there
// nothing here" always has a visible answer (outside every box = no data).
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

const WORLD_CENTER: [number, number] = [20, 40];
const WORLD_ZOOM = 2;

const CATEGORY_OPTIONS: VesselCategory[] = ['tanker', 'cargo', 'other', 'unknown'];

/** Recenters the map whenever the selected chokepoint changes. Has to live
 * inside <MapContainer> — react-leaflet exposes the map instance via a hook,
 * not a prop, so this is the idiomatic way to drive it imperatively. */
const FlyToRegion: React.FC<{ region: string | null }> = ({ region }) => {
  const map = useMap();
  React.useEffect(() => {
    const target = CHOKEPOINTS.find((c) => c.region === region);
    if (target) {
      map.flyTo(
        [(target.box[0][0] + target.box[1][0]) / 2, (target.box[0][1] + target.box[1][1]) / 2],
        6,
        { duration: 0.75 },
      );
    } else {
      map.flyTo(WORLD_CENTER, WORLD_ZOOM, { duration: 0.75 });
    }
  }, [region, map]);
  return null;
};

const VesselTracker: React.FC = () => {
  const auth = useAuth();
  const tier = auth?.tier ?? 'free';
  const isPro = tier === 'pro';
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [regionFilter, setRegionFilter] = useState<string | null>(null);
  const [categories, setCategories] = useState<VesselCategory[]>(['tanker', 'cargo']);

  const vesselsQuery = useVesselPositions();
  const allVessels = useMemo(() => (isPro ? (vesselsQuery.data ?? []) : []), [isPro, vesselsQuery.data]);

  const vessels = useMemo(() => {
    return allVessels.filter((v) => {
      if (regionFilter && v.region !== regionFilter) return false;
      return categories.includes(vesselCategory(v.ship_type));
    });
  }, [allVessels, regionFilter, categories]);

  const countsByRegion = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of allVessels) counts.set(v.region, (counts.get(v.region) ?? 0) + 1);
    return counts;
  }, [allVessels]);

  const lastUpdated = useMemo(() => {
    if (allVessels.length === 0) return null;
    return allVessels.reduce<string | null>((latest, v) => (
      !latest || v.updated_at > latest ? v.updated_at : latest
    ), null);
  }, [allVessels]);

  return (
    <PageShell
      eyebrow="LIVE · vessel.tracker"
      title="Vessel Tracker"
      width="6xl"
      description="Live AIS tanker and cargo traffic at the chokepoints that move oil, LNG, and dry-bulk flows — Hormuz, Suez, Malacca, Panama, and more. Positions refresh roughly every minute via AISStream."
      actions={isPro ? (
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground font-mono hidden sm:inline">
              updated {formatDistanceToNowStrict(new Date(lastUpdated), { addSuffix: true })}
            </span>
          )}
          <Button
            size="sm" variant="ghost" className="h-8 text-xs"
            onClick={() => void vesselsQuery.refetch()}
            disabled={vesselsQuery.isFetching}
          >
            <RefreshCw className={cn('w-3.5 h-3.5 mr-1', vesselsQuery.isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      ) : undefined}
    >
      {!isPro ? (
        <div className="border border-border rounded-md overflow-hidden bg-card/40 p-4">
          <div className="border border-primary/30 bg-primary/5 rounded-md p-4 flex items-start gap-3">
            <Lock className="w-5 h-5 text-primary mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-sm">Vessel Tracker is a Pro feature</p>
              <p className="text-xs text-muted-foreground mt-1">
                Live tanker and cargo-ship positions at Hormuz, Suez, Malacca, Panama, the
                Bosphorus, Gibraltar, and the US Gulf Coast — a real-time read on physical
                commodity flow, sourced from AIS transponder data.
              </p>
            </div>
            <Button onClick={() => setPaywallOpen(true)}>Upgrade</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <Select value={regionFilter ?? 'all'} onValueChange={(v) => setRegionFilter(v === 'all' ? null : v)}>
                <SelectTrigger className="h-8 w-[220px] text-xs">
                  <SelectValue placeholder="All chokepoints" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All chokepoints ({allVessels.length})</SelectItem>
                  {CHOKEPOINTS.map((c) => (
                    <SelectItem key={c.region} value={c.region}>
                      {c.region} ({countsByRegion.get(c.region) ?? 0})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ToggleGroup
                type="multiple"
                value={categories}
                onValueChange={(v) => v.length > 0 && setCategories(v as VesselCategory[])}
                className="border border-border rounded-md p-0.5"
              >
                {CATEGORY_OPTIONS.map((cat) => (
                  <ToggleGroupItem key={cat} value={cat} className="h-7 px-2 text-xs gap-1.5" aria-label={cat}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: VESSEL_CATEGORY_COLORS[cat] }} />
                    {VESSEL_CATEGORY_LABELS[cat]}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <Badge variant="outline" className="font-mono text-xs">
              <Ship className="w-3 h-3 mr-1" /> {vessels.length} shown
            </Badge>
          </div>

          {vesselsQuery.isError && (
            <div className="text-xs text-destructive border border-destructive/30 bg-destructive/5 rounded-md p-3">
              Couldn't load vessel positions. Try refreshing.
            </div>
          )}

          <div className="border border-border rounded-md overflow-hidden" style={{ height: '65vh', minHeight: 420 }}>
            <MapContainer
              center={WORLD_CENTER}
              zoom={WORLD_ZOOM}
              worldCopyJump
              style={{ height: '100%', width: '100%', background: '#0b1220' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              <FlyToRegion region={regionFilter} />
              {CHOKEPOINTS.map((c) => (
                <Rectangle
                  key={c.region}
                  bounds={c.box}
                  pathOptions={{ color: '#64748b', weight: 1, fillOpacity: 0.03, dashArray: '4 4' }}
                  eventHandlers={{ click: () => setRegionFilter(c.region) }}
                >
                  <Popup>{c.region}</Popup>
                </Rectangle>
              ))}
              {vessels.map((v) => {
                const cat = vesselCategory(v.ship_type);
                return (
                  <CircleMarker
                    key={v.mmsi}
                    center={[v.lat, v.lon]}
                    radius={5}
                    pathOptions={{
                      color: VESSEL_CATEGORY_COLORS[cat],
                      fillColor: VESSEL_CATEGORY_COLORS[cat],
                      fillOpacity: 0.85,
                      weight: 1,
                    }}
                  >
                    <Popup>
                      <VesselPopup vessel={v} category={cat} />
                    </Popup>
                  </CircleMarker>
                );
              })}
            </MapContainer>
          </div>

          <p className="text-xs text-muted-foreground">
            Data via <a href="https://aisstream.io" target="_blank" rel="noreferrer" className="underline">AISStream</a>,
            {' '}sourced from AIS transponders — coverage depends on terrestrial/satellite reception and is not a
            complete picture of traffic. "Unclassified" vessels haven't broadcast static data (name/type) recently.
          </p>
        </div>
      )}
      <PremiumPaywall open={paywallOpen} onOpenChange={setPaywallOpen} />
    </PageShell>
  );
};

const VesselPopup: React.FC<{ vessel: VesselPosition; category: VesselCategory }> = ({ vessel, category }) => (
  <div className="font-mono text-xs space-y-1 min-w-[180px]">
    <div className="font-semibold text-sm">{vessel.ship_name ?? `MMSI ${vessel.mmsi}`}</div>
    <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span>{VESSEL_CATEGORY_LABELS[category]}</span></div>
    <div className="flex justify-between"><span className="text-muted-foreground">MMSI</span><span>{vessel.mmsi}</span></div>
    <div className="flex justify-between"><span className="text-muted-foreground">Speed</span><span>{vessel.sog != null ? `${vessel.sog.toFixed(1)} kn` : '—'}</span></div>
    <div className="flex justify-between"><span className="text-muted-foreground">Heading</span><span>{vessel.true_heading != null ? `${vessel.true_heading}°` : '—'}</span></div>
    <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span>{navStatusLabel(vessel.nav_status)}</span></div>
    {vessel.destination && (
      <div className="flex justify-between"><span className="text-muted-foreground">Destination</span><span>{vessel.destination}</span></div>
    )}
    <div className="flex justify-between"><span className="text-muted-foreground">Region</span><span>{vessel.region}</span></div>
    <div className="flex justify-between"><span className="text-muted-foreground">Updated</span><span>{formatDistanceToNowStrict(new Date(vessel.updated_at), { addSuffix: true })}</span></div>
  </div>
);

export default VesselTracker;
