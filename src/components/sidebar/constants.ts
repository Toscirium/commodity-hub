import { Zap, Coins, Wheat, Beef, Milk, Briefcase, BarChart3, Star, Filter, Calendar, Lightbulb, GraduationCap, Users, Activity, Factory, Calculator, Bell, TrendingUp, GitCompare, ArrowUpDown, Gauge, Layers, Bot, CalendarRange, GitCompareArrows, Sparkles, Radar, PieChart, FlaskConical, Droplets } from "lucide-react";
import { CommodityGroup, MarketTool } from "./types";

export const COMMODITY_GROUPS: CommodityGroup[] = [
  { id: "energy", label: "Energy", icon: Zap, color: "text-muted-foreground" },
  { id: "metals", label: "Metals", icon: Coins, color: "text-muted-foreground" },
  { id: "grains", label: "Grains", icon: Wheat, color: "text-muted-foreground" },
  { id: "livestock", label: "Livestock", icon: Beef, color: "text-muted-foreground" },
  { id: "dairy", label: "Dairy", icon: Milk, color: "text-muted-foreground" },
  { id: "industrials", label: "Industrials", icon: Factory, color: "text-muted-foreground" },
];

export const MARKET_TOOLS: MarketTool[] = [
  { id: "copilot", label: "AI Copilot", icon: Bot, color: "text-foreground", path: "/copilot" },
  { id: "portfolio", label: "Portfolio", icon: Briefcase, color: "text-foreground", path: "/portfolio" },
  { id: "alerts", label: "Price Alerts", icon: Bell, color: "text-foreground", path: "/alerts" },
  { id: "fundamentals", label: "Fundamentals", icon: Droplets, color: "text-foreground", path: "/fundamentals" },
  { id: "correlation", label: "Correlation", icon: BarChart3, color: "text-foreground", path: "/correlation" },
  { id: "watchlists", label: "Watchlists", icon: Star, color: "text-foreground", path: "/watchlists" },
  { id: "screener", label: "Screener", icon: Filter, color: "text-foreground", path: "/screener" },
  { id: "calendar", label: "Calendar", icon: Calendar, color: "text-foreground", path: "/calendar" },
  { id: "position-calculator", label: "Position Size Calculator", icon: Calculator, color: "text-foreground", path: "/position-calculator" },
];

export const PRO_TOOLS: MarketTool[] = [
  { id: "pro-analytics", label: "Analytics Workspace", icon: BarChart3, color: "text-foreground", path: "/pro-analytics" },
  { id: "daily-brief", label: "Daily Brief", icon: Sparkles, color: "text-foreground", path: "/daily-brief" },
  { id: "seasonality", label: "Seasonality", icon: CalendarRange, color: "text-foreground", path: "/seasonality" },
  { id: "spread-monitor", label: "Spread Monitor", icon: GitCompareArrows, color: "text-foreground", path: "/spread-monitor" },
  { id: "regime-scanner", label: "Regime Scanner", icon: Radar, color: "text-foreground", path: "/regime-scanner" },
  { id: "portfolio-analytics", label: "Portfolio Analytics", icon: PieChart, color: "text-foreground", path: "/portfolio-analytics" },
  { id: "backtest", label: "Backtest Sandbox", icon: FlaskConical, color: "text-foreground", path: "/backtest" },
  { id: "forward-curves", label: "Forward Curves", icon: TrendingUp, color: "text-foreground", path: "/forward-curves" },
  { id: "spreads", label: "Spread Calculator", icon: GitCompare, color: "text-foreground", path: "/spreads" },
  { id: "cot", label: "COT Reports", icon: Users, color: "text-foreground", path: "/cot" },
  { id: "roll-scanner", label: "Roll Yield Scanner", icon: ArrowUpDown, color: "text-foreground", path: "/roll-scanner" },
  { id: "vol-cone", label: "Volatility Cone", icon: Gauge, color: "text-foreground", path: "/volatility-cone" },
  { id: "term-structure", label: "Term Structure Shift", icon: Layers, color: "text-foreground", path: "/term-structure" },
];

export const COMMUNITY_TOOLS: MarketTool[] = [
  { id: "insights", label: "Expert Insights", icon: Lightbulb, color: "text-foreground", path: "/insights" },
  { id: "learning", label: "Learning Hub", icon: GraduationCap, color: "text-foreground", path: "/learning" },
  { id: "sentiment", label: "Market Sentiment", icon: Users, color: "text-foreground", path: "/sentiment" },
];

export const ACTIVITY_TOOLS: MarketTool[] = [
  { id: "market-status", label: "Market Status", icon: Activity, color: "text-foreground", path: "/market-status" },
];
