import React, { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import CommoditySidebar from "@/components/CommoditySidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Clock, CheckCircle, XCircle, AlertCircle, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useCommodityCounts } from "@/hooks/useCommodityCounts";

interface MarketConfig {
  id: string;
  market_name: string;
  timezone: string;
  open_time: string;
  close_time: string;
  trading_days: number[];
  holidays: any;
}

interface MarketStatus {
  market: MarketConfig;
  isOpen: boolean;
  nextChange: Date;
  timeUntilChange: string;
  currentTime: string;
  progressPercent: number;
}

const MarketStatus = () => {
  const [activeGroup, setActiveGroup] = useState("energy");
  const [marketConfigs, setMarketConfigs] = useState<MarketConfig[]>([]);
  const [marketStatuses, setMarketStatuses] = useState<MarketStatus[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();
  const commodityCounts = useCommodityCounts();

  useEffect(() => {
    fetchMarketConfigs();
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (marketConfigs.length > 0) {
      updateMarketStatuses();
    }
  }, [marketConfigs, currentTime]);

  const fetchMarketConfigs = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('market_status_config')
        .select('*')
        .order('market_name');
      
      if (error) throw error;
      setMarketConfigs(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load market configurations",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const updateMarketStatuses = () => {
    const statuses: MarketStatus[] = marketConfigs.map(market => {
      const status = calculateMarketStatus(market);
      return status;
    });
    setMarketStatuses(statuses);
  };

  const calculateMarketStatus = (market: MarketConfig): MarketStatus => {
    const now = new Date();
    const today = now.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Check if today is a trading day
    const isTradingDay = market.trading_days.includes(today);
    
    // Parse times (assuming they're in the market's timezone)
    const [openHour, openMinute] = market.open_time.split(':').map(Number);
    const [closeHour, closeMinute] = market.close_time.split(':').map(Number);
    
    const todayOpen = new Date(now);
    todayOpen.setHours(openHour, openMinute, 0, 0);
    
    const todayClose = new Date(now);
    todayClose.setHours(closeHour, closeMinute, 0, 0);
    
    // Handle markets that close next day (e.g., Sunday 6PM to Monday 5PM)
    if (closeHour < openHour) {
      todayClose.setDate(todayClose.getDate() + 1);
    }
    
    let isOpen = false;
    let nextChange = new Date();
    let progressPercent = 0;
    
    if (isTradingDay && now >= todayOpen && now <= todayClose) {
      isOpen = true;
      nextChange = todayClose;
      const totalTime = todayClose.getTime() - todayOpen.getTime();
      const elapsedTime = now.getTime() - todayOpen.getTime();
      progressPercent = (elapsedTime / totalTime) * 100;
    } else {
      isOpen = false;
      // Find next opening time
      const nextOpen = new Date(todayOpen);
      if (now > todayClose || !isTradingDay) {
        // Move to next trading day
        let nextDay = (today + 1) % 7;
        let daysToAdd = 1;
        
        while (!market.trading_days.includes(nextDay)) {
          nextDay = (nextDay + 1) % 7;
          daysToAdd++;
        }
        
        nextOpen.setDate(nextOpen.getDate() + daysToAdd);
      }
      nextChange = nextOpen;
      progressPercent = 0;
    }
    
    const timeUntilChange = formatTimeUntil(nextChange);
    const currentTimeStr = now.toLocaleTimeString('en-US', {
      timeZone: market.timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    return {
      market,
      isOpen,
      nextChange,
      timeUntilChange,
      currentTime: currentTimeStr,
      progressPercent: Math.max(0, Math.min(100, progressPercent))
    };
  };

  const formatTimeUntil = (targetTime: Date): string => {
    const now = new Date();
    const diffMs = targetTime.getTime() - now.getTime();
    
    if (diffMs <= 0) return "Now";
    
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diffMs % (1000 * 60)) / 1000);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getStatusIcon = (isOpen: boolean) => {
    if (isOpen) {
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    } else {
      return <XCircle className="h-5 w-5 text-red-500" />;
    }
  };

  const getStatusBadge = (isOpen: boolean) => {
    if (isOpen) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          OPEN
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200">
          CLOSED
        </Badge>
      );
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <CommoditySidebar 
          activeGroup={activeGroup}
          onGroupSelect={(group) => navigate(`/?group=${group}`)}
          commodityCounts={commodityCounts}
        />
        <SidebarInset className="flex-1">
          <header className="flex h-16 shrink-0 items-center border-b px-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mr-2">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Dashboard
            </Button>
            <Separator orientation="vertical" className="mr-2 h-4" />
            <SidebarTrigger className="p-2 min-h-[48px] min-w-[48px]" />
            <Separator orientation="vertical" className="mr-2 h-4" />
            <div className="flex items-center gap-2">
              <Clock className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">Market Status</h1>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  Global Market Status
                </h2>
                <p className="text-muted-foreground">
                  Real-time status of major commodity exchanges worldwide
                </p>
              </div>

              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {loading ? (
                  <div className="col-span-full flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : marketStatuses.length === 0 ? (
                  <div className="col-span-full text-center py-12">
                    <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No market data available</h3>
                    <p className="text-muted-foreground">
                      Market status information will appear here when available
                    </p>
                  </div>
                ) : (
                  marketStatuses.map((status) => (
                    <Card key={status.market.id} className="hover:shadow-md transition-shadow">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-lg">{status.market.market_name}</CardTitle>
                          {getStatusIcon(status.isOpen)}
                        </div>
                        <div className="flex items-center gap-2">
                          {getStatusBadge(status.isOpen)}
                          <Badge variant="outline" className="text-xs">
                            {status.market.timezone.split('/')[1]?.replace('_', ' ')}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>Current Time:</span>
                            <span className="font-mono">{status.currentTime}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span>Trading Hours:</span>
                            <span className="font-mono">
                              {status.market.open_time.slice(0, 5)} - {status.market.close_time.slice(0, 5)}
                            </span>
                          </div>
                        </div>

                        {status.isOpen && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>Session Progress:</span>
                              <span>{status.progressPercent.toFixed(1)}%</span>
                            </div>
                            <Progress value={status.progressPercent} className="h-2" />
                          </div>
                        )}

                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>{status.isOpen ? 'Closes in:' : 'Opens in:'}</span>
                            <span className="font-mono text-primary font-medium">
                              {status.timeUntilChange}
                            </span>
                          </div>
                        </div>

                        <div className="pt-2 border-t">
                          <div className="text-xs text-muted-foreground">
                            Trading Days: {status.market.trading_days.map(day => {
                              const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
                              return days[day];
                            }).join(', ')}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5" />
                    Market Notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>• Market times are displayed in their respective local timezones</p>
                  <p>• Some markets may have extended trading hours or pre-market sessions</p>
                  <p>• Holiday schedules may affect normal trading hours</p>
                  <p>• Electronic trading may continue outside regular pit trading hours</p>
                </CardContent>
              </Card>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default MarketStatus;