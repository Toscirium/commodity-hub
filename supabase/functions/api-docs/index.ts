import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from '../_shared/utils.ts';
import {
  IpRateLimiter,
  rateLimitHeaders,
  tooManyRequestsResponse,
  logRateLimitBreach,
} from '../_shared/rateLimit.ts';

// 30 requests/minute per IP — api-docs is read-only static content; no need to
// allow rapid polling.
const limiter = new IpRateLimiter({ limit: 30, windowMs: 60_000 });

const openApiSpec = {
  openapi: "3.0.3",
  info: {
    title: "Commodity Trading Platform API",
    description: "Comprehensive API for commodity data, trading, and market analysis",
    version: "1.0.0",
    contact: {
      name: "API Support",
      email: "support@commodityplatform.com"
    }
  },
  servers: [
    {
      url: "https://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1",
      description: "Production server"
    }
  ],
  paths: {
    "/fetch-all-commodities": {
      post: {
        summary: "Fetch all available commodities",
        description: "Returns a comprehensive list of all available commodities with current pricing",
        tags: ["Commodities"],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  dataDelay: {
                    type: "string",
                    enum: ["realtime", "15min"],
                    default: "realtime",
                    description: "Data delay preference (15min for free users)"
                  }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Successful response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    commodities: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Commodity" }
                    },
                    count: { type: "integer" },
                    timestamp: { type: "string", format: "date-time" },
                    dataDelay: { type: "string" },
                    isDelayed: { type: "boolean" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/fetch-commodity-data": {
      post: {
        summary: "Fetch historical chart data for a commodity",
        description: "Returns historical price data for charting purposes",
        tags: ["Commodities"],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["commodityName", "timeframe"],
                properties: {
                  commodityName: { type: "string", description: "Name of the commodity" },
                  timeframe: {
                    type: "string",
                    enum: ["1d", "1w", "1m", "3m", "6m", "1y"],
                    description: "Time period for historical data"
                  },
                  chartType: {
                    type: "string",
                    enum: ["line", "candlestick"],
                    default: "line"
                  },
                  isPremium: { type: "boolean", default: false },
                  dataDelay: { type: "string", enum: ["realtime", "15min"], default: "realtime" },
                  contractSymbol: { type: "string", description: "Specific contract symbol (optional)" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Successful response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/ChartDataPoint" }
                    },
                    commodity: { type: "string" },
                    timeframe: { type: "string" },
                    count: { type: "integer" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/fetch-commodity-prices": {
      post: {
        summary: "Fetch current price for a specific commodity",
        description: "Returns current pricing information for a single commodity",
        tags: ["Commodities"],
        security: [{ "bearerAuth": [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["commodityName"],
                properties: {
                  commodityName: { type: "string" },
                  isPremium: { type: "boolean", default: false },
                  dataDelay: { type: "string", enum: ["realtime", "15min"], default: "realtime" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Successful response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    price: { $ref: "#/components/schemas/PriceData" },
                    source: { type: "string" },
                    commodity: { type: "string" },
                    symbol: { type: "string" },
                    realTime: { type: "boolean" },
                    dataDelay: { type: "string" },
                    isDelayed: { type: "boolean" }
                  }
                }
              }
            }
          },
          "401": {
            description: "Unauthorized - Authentication required"
          }
        }
      }
    },
    "/fetch-ibkr-futures": {
      get: {
        summary: "Fetch IBKR futures contracts",
        description: "Returns available Interactive Brokers futures contracts for a commodity",
        tags: ["Trading"],
        parameters: [
          {
            name: "commodity",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "Commodity name to fetch contracts for"
          }
        ],
        responses: {
          "200": {
            description: "Successful response",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    contracts: {
                      type: "array",
                      items: { $ref: "#/components/schemas/IBKRContract" }
                    },
                    commodity: { type: "string" },
                    count: { type: "integer" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/create-checkout": {
      post: {
        summary: "Create Stripe checkout session",
        description: "Creates a Stripe checkout session for subscription upgrade",
        tags: ["Billing"],
        security: [{ "bearerAuth": [] }],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["priceId"],
                properties: {
                  priceId: { type: "string", description: "Stripe price ID" },
                  successUrl: { type: "string", description: "Success redirect URL" },
                  cancelUrl: { type: "string", description: "Cancel redirect URL" }
                }
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Checkout session created",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: { type: "string", description: "Checkout URL" }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      Commodity: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Trading symbol" },
          name: { type: "string", description: "Commodity name" },
          price: { type: "number", description: "Current price" },
          change: { type: "number", description: "Price change" },
          changePercent: { type: "number", description: "Percentage change" },
          volume: { type: "integer", description: "Trading volume" },
          category: { type: "string", description: "Commodity category" },
          contractSize: { type: "string", description: "Contract size specification" },
          venue: { type: "string", description: "Trading venue" }
        }
      },
      ChartDataPoint: {
        type: "object",
        properties: {
          date: { type: "string", format: "date-time" },
          price: { type: "number" },
          open: { type: "number", description: "Opening price (candlestick only)" },
          high: { type: "number", description: "High price (candlestick only)" },
          low: { type: "number", description: "Low price (candlestick only)" },
          close: { type: "number", description: "Closing price (candlestick only)" }
        }
      },
      PriceData: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          price: { type: "number" },
          change: { type: "number" },
          changePercent: { type: "number" },
          lastUpdate: { type: "string", format: "date-time" }
        }
      },
      IBKRContract: {
        type: "object",
        properties: {
          symbol: { type: "string" },
          description: { type: "string" },
          expiry: { type: "string" },
          exchange: { type: "string" },
          currency: { type: "string" },
          multiplier: { type: "number" }
        }
      }
    },
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    }
  },
  tags: [
    { name: "Commodities", description: "Commodity data and pricing" },
    { name: "Trading", description: "Trading instruments and contracts" },
    { name: "Billing", description: "Subscription and billing management" }
  ]
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const ip = IpRateLimiter.getClientIp(req);
  const rl = limiter.check(ip);
  if (!rl.allowed) {
    await logRateLimitBreach('api-docs', ip, rl, req, limiter);
    return tooManyRequestsResponse(rl, corsHeaders);
  }
  const rlHeaders = rateLimitHeaders(rl);

  const url = new URL(req.url);
  const format = url.searchParams.get('format') || 'json';

  if (format === 'yaml') {
    // Convert to YAML format (basic implementation)
    const yamlContent = `# Commodity Trading Platform API
# OpenAPI 3.0.3 Specification
openapi: "3.0.3"
info:
  title: "Commodity Trading Platform API"
  description: "Comprehensive API for commodity data, trading, and market analysis"
  version: "1.0.0"
  contact:
    name: "API Support"
    email: "support@commodityplatform.com"
# For full YAML specification, use the JSON format and convert using external tools
`;
    
    return new Response(yamlContent, {
      headers: { 
        ...corsHeaders, 
        ...rlHeaders,
        'Content-Type': 'text/yaml',
        'Content-Disposition': 'attachment; filename="api-spec.yaml"'
      }
    });
  }

  // Default to JSON format
  return new Response(JSON.stringify(openApiSpec, null, 2), {
    headers: { ...corsHeaders, ...rlHeaders, 'Content-Type': 'application/json' }
  });
});