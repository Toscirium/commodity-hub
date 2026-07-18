export interface CommodityCounts {
  energy: number;
  metals: number;
  grains: number;
  livestock: number;
  dairy: number;
  softs: number;
  industrials: number;
}

export interface CommodityGroup {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

export interface MarketTool {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  path: string;
}
