// Shared input validation schemas for edge functions
// Uses zod for comprehensive, type-safe schema validation

import { z } from "https://esm.sh/zod@3.23.8";

// ── Common validators ──────────────────────────────────────────────

const symbolPattern = /^[a-zA-Z0-9.-]+$/;

export const SessionIdSchema = z.object({
  sessionId: z.string().min(1, "sessionId is required").max(200),
});

// ── IBKR Client Portal schemas ─────────────────────────────────────

export const OrderSchema = z.object({
  symbol: z
    .string()
    .min(1, "Symbol is required")
    .max(20, "Symbol must be at most 20 characters")
    .regex(symbolPattern, "Symbol must be alphanumeric (dots and hyphens allowed)"),
  side: z.enum(["BUY", "SELL"], { message: "Side must be BUY or SELL" }),
  quantity: z
    .number({ message: "Quantity must be a number" })
    .positive("Quantity must be positive")
    .max(1_000_000, "Quantity must not exceed 1,000,000")
    .finite("Quantity must be finite"),
  orderType: z.enum(["MKT", "LMT", "STP", "STP_LMT", "TRAIL"], {
    message: "Order type must be MKT, LMT, STP, STP_LMT, or TRAIL",
  }),
  price: z
    .number()
    .positive("Price must be positive")
    .finite("Price must be finite")
    .optional(),
  stopPrice: z
    .number()
    .positive("Stop price must be positive")
    .finite("Stop price must be finite")
    .optional(),
  trailAmount: z
    .number()
    .positive("Trail amount must be positive")
    .finite("Trail amount must be finite")
    .optional(),
  tif: z
    .enum(["GTC", "DAY", "IOC", "FOK"], {
      message: "TIF must be GTC, DAY, IOC, or FOK",
    })
    .default("DAY"),
  parentOrderId: z.number().int().positive().optional(),
  orderRef: z.string().max(100, "Order ref must be under 100 chars").optional(),
}).refine(
  (o) => {
    if (o.orderType === "LMT" || o.orderType === "STP_LMT") return o.price != null;
    return true;
  },
  { message: "Price is required for limit orders", path: ["price"] }
).refine(
  (o) => {
    if (o.orderType === "STP" || o.orderType === "STP_LMT") return o.stopPrice != null;
    return true;
  },
  { message: "Stop price is required for stop orders", path: ["stopPrice"] }
);

export const PlaceOrderSchema = SessionIdSchema.extend({
  order: z.object({}).passthrough(), // parsed separately via OrderSchema
});

export const SymbolsSchema = SessionIdSchema.extend({
  symbols: z
    .array(
      z
        .string()
        .min(1)
        .max(20)
        .regex(symbolPattern, "Each symbol must be alphanumeric")
    )
    .min(1, "At least one symbol is required")
    .max(50, "Maximum 50 symbols allowed"),
});

export const CancelOrderSchema = SessionIdSchema.extend({
  orderId: z.string().uuid("orderId must be a valid UUID"),
});

export const ModifyOrderSchema = SessionIdSchema.extend({
  orderId: z.string().uuid("orderId must be a valid UUID"),
  updates: z.object({
    price: z.number().positive().finite().optional(),
    quantity: z.number().positive().max(1_000_000).finite().optional(),
    stopPrice: z.number().positive().finite().optional(),
    trailAmount: z.number().positive().finite().optional(),
  }).refine(
    (u) => Object.values(u).some((v) => v != null),
    { message: "At least one field must be provided for modification" }
  ),
});

// ── Decrypt API Key schemas ────────────────────────────────────────

export const DecryptKeySchema = z.object({
  encryptedKey: z
    .string()
    .min(1, "encryptedKey is required")
    .max(10_000, "encryptedKey must be under 10,000 characters"),
  userSecret: z
    .string()
    .min(1, "userSecret is required")
    .max(1_000, "userSecret must be under 1,000 characters"),
});

// ── Utility: safe error formatting ─────────────────────────────────

/**
 * Formats a ZodError into a concise, user-safe message.
 */
export function formatValidationError(error: z.ZodError): string {
  return error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
}

/**
 * Returns a generic error message for production, logging details server-side.
 */
export function safeErrorMessage(error: unknown, context: string): string {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[${context}] Error:`, detail);

  // Map known error types to safe messages
  if (detail.includes("authentication") || detail.includes("Unauthorized")) {
    return "Authentication failed";
  }
  if (detail.includes("session") || detail.includes("expired")) {
    return "Session invalid or expired";
  }
  if (detail.includes("credentials")) {
    return "Credential operation failed";
  }
  if (detail.includes("decrypt")) {
    return "Failed to decrypt credentials";
  }

  return "An error occurred processing your request";
}
