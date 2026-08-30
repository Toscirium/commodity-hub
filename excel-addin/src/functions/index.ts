/**
 * Entry point for the custom-functions bundle.
 *
 * Office looks up each function by the id declared in functions.json and
 * matches it to whatever was registered here via CustomFunctions.associate.
 * The ids MUST match functions.json exactly — a mismatch shows up in Excel as
 * a silent #NAME? with no error anywhere, which is miserable to debug, so
 * there's a test (functionsManifest.test.ts) asserting the two stay in sync.
 */
import * as fns from './functions';

/* global CustomFunctions */

const REGISTRATIONS: Record<string, (...args: never[]) => unknown> = {
  PRICE: fns.price,
  PRICE_IN: fns.priceIn,
  BASIS: fns.basis,
  CONVERT: fns.convert,
  COT: fns.cot,
  COT_DATE: fns.cotDate,
  HISTORY: fns.history,
  CONTRACT_TONNES: fns.contractTonnes,
  LOTS_FOR: fns.lotsFor,
  LOTS_TO_QTY: fns.lotsToQty,
};

export { REGISTRATIONS };

if (typeof CustomFunctions !== 'undefined') {
  for (const [id, fn] of Object.entries(REGISTRATIONS)) {
    CustomFunctions.associate(id, fn as never);
  }
}
