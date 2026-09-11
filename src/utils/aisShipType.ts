/**
 * Decodes the numeric AIS "ship and cargo type" code (ITU-R M.1371,
 * `ship_type` in `vessel_positions`, from ShipStaticData's `Type` field)
 * into the coarse category the Vessel Tracker actually cares about.
 *
 * Only tankers and cargo vessels move the commodities this app tracks; the
 * rest (passenger ships, tugs, fishing boats, etc.) are noise at a chokepoint
 * like the Bosphorus or the Singapore Strait. `ship_type` is null until a
 * vessel's AIS transponder happens to send a ShipStaticData message (far
 * less frequent than PositionReport), so "unknown" is a real, common case —
 * not an error.
 */
export type VesselCategory = 'tanker' | 'cargo' | 'other' | 'unknown';

export const vesselCategory = (shipType: number | null | undefined): VesselCategory => {
  if (shipType == null) return 'unknown';
  if (shipType >= 80 && shipType <= 89) return 'tanker';
  if (shipType >= 70 && shipType <= 79) return 'cargo';
  return 'other';
};

export const VESSEL_CATEGORY_LABELS: Record<VesselCategory, string> = {
  tanker: 'Tanker',
  cargo: 'Cargo',
  other: 'Other',
  unknown: 'Unclassified',
};

// Matches the semantic color tokens used elsewhere (e.g. price up/down) —
// tankers get the "energy" amber, cargo a neutral blue, everything else muted.
export const VESSEL_CATEGORY_COLORS: Record<VesselCategory, string> = {
  tanker: '#f59e0b',
  cargo: '#3b82f6',
  other: '#94a3b8',
  unknown: '#64748b',
};

const NAV_STATUS_LABELS: Record<number, string> = {
  0: 'Under way (engine)',
  1: 'At anchor',
  2: 'Not under command',
  3: 'Restricted manoeuvrability',
  4: 'Constrained by draught',
  5: 'Moored',
  6: 'Aground',
  7: 'Fishing',
  8: 'Under way (sailing)',
  11: 'Power-driven towing astern',
  12: 'Power-driven pushing ahead',
  14: 'AIS-SART / distress',
};

export const navStatusLabel = (navStatus: number | null | undefined): string =>
  navStatus != null ? (NAV_STATUS_LABELS[navStatus] ?? `Status ${navStatus}`) : 'Unknown';
