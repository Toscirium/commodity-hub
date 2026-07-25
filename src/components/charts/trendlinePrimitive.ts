import type {
  IChartApi,
  ISeriesApi,
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  PrimitiveHoveredItem,
  Time,
} from 'lightweight-charts';
import type { CanvasRenderingTarget2D } from 'fancy-canvas';
import type { Trendline } from '@/hooks/useTrendlines';

interface ScreenPoint {
  x: number;
  y: number;
}

const HIT_TEST_TOLERANCE_PX = 6;

const distanceToSegment = (p: ScreenPoint, a: ScreenPoint, b: ScreenPoint): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

class TrendlinePaneRenderer implements IPrimitivePaneRenderer {
  constructor(
    private readonly p1: ScreenPoint | null,
    private readonly p2: ScreenPoint | null,
    private readonly color: string,
    private readonly selected: boolean
  ) {}

  draw(target: CanvasRenderingTarget2D): void {
    const { p1, p2 } = this;
    if (!p1 || !p2) return;
    target.useBitmapCoordinateSpace((scope) => {
      const ctx = scope.context;
      ctx.save();
      ctx.scale(scope.horizontalPixelRatio, scope.verticalPixelRatio);
      ctx.strokeStyle = this.color;
      ctx.lineWidth = this.selected ? 2.5 : 1.5;
      ctx.globalAlpha = this.selected ? 1 : 0.85;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.restore();
    });
  }
}

class TrendlinePaneView implements IPrimitivePaneView {
  constructor(private readonly source: TrendlinePrimitive) {}

  // The series repaints its own 'normal'-z layer every frame, which would erase
  // a primitive drawn there — 'top' renders on the overlay layer above that repaint.
  zOrder(): 'top' {
    return 'top';
  }

  renderer(): IPrimitivePaneRenderer | null {
    return new TrendlinePaneRenderer(
      this.source.screenPoint(this.source.trendline.p1),
      this.source.screenPoint(this.source.trendline.p2),
      this.source.trendline.color ?? this.source.defaultColor,
      this.source.selected
    );
  }
}

/**
 * Draws one trendline on a candlestick/line series. Stores endpoints in time/price
 * space (not pixels) and re-resolves screen coordinates on every draw via the
 * series/chart APIs, so it auto-tracks pan/zoom/resize with no manual sync code —
 * mirrors TradingView's own plugin-examples trend-line pattern.
 */
export class TrendlinePrimitive implements ISeriesPrimitive<Time> {
  public selected = false;
  public defaultColor: string;
  public trendline: Trendline;

  private chart: IChartApi | null = null;
  private series: ISeriesApi<'Candlestick', Time> | ISeriesApi<'Line', Time> | null = null;
  private readonly paneView: TrendlinePaneView;

  constructor(trendline: Trendline, defaultColor: string) {
    this.trendline = trendline;
    this.defaultColor = defaultColor;
    this.paneView = new TrendlinePaneView(this);
  }

  attached({ chart, series }: SeriesAttachedParameter<Time>): void {
    this.chart = chart as IChartApi;
    this.series = series as ISeriesApi<'Candlestick', Time> | ISeriesApi<'Line', Time>;
  }

  detached(): void {
    this.chart = null;
    this.series = null;
  }

  updateAllViews(): void {
    // No cached per-frame state to invalidate — screenPoint() re-resolves live each draw.
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return [this.paneView];
  }

  screenPoint(point: Trendline['p1']): ScreenPoint | null {
    if (!this.chart || !this.series) return null;
    const x = this.chart.timeScale().timeToCoordinate(point.time);
    const y = this.series.priceToCoordinate(point.price);
    if (x === null || y === null) return null;
    return { x, y };
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    const p1 = this.screenPoint(this.trendline.p1);
    const p2 = this.screenPoint(this.trendline.p2);
    if (!p1 || !p2) return null;
    const distance = distanceToSegment({ x, y }, p1, p2);
    if (distance > HIT_TEST_TOLERANCE_PX) return null;
    return {
      externalId: this.trendline.id,
      zOrder: 'top',
      cursorStyle: 'pointer',
      distance,
    };
  }
}
