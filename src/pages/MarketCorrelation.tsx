import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TrendingUp, TrendingDown, Activity, BarChart3, ArrowLeft, Smartphone, Monitor } from 'lucide-react';
import { useAvailableCommodities } from '@/hooks/useCommodityData';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';

const MarketCorrelation = () => {
  const [timeframe, setTimeframe] = useState('30d');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const { data: commodities } = useAvailableCommodities();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Filter commodities by category
  const filteredCommodities = selectedCategory === 'all' 
    ? (commodities || [])
    : (commodities || []).filter(c => c.category === selectedCategory);

  // Mock correlation data - in a real app, this would be calculated from historical price data
  const generateCorrelationMatrix = () => {
    const matrix: { [key: string]: { [key: string]: number } } = {};
    
    filteredCommodities.forEach(commodity1 => {
      matrix[commodity1.name] = {};
      filteredCommodities.forEach(commodity2 => {
        if (commodity1.name === commodity2.name) {
          matrix[commodity1.name][commodity2.name] = 1.0;
        } else {
          // Generate mock correlation values based on category similarity
          const sameCategory = commodity1.category === commodity2.category;
          const baseCorrelation = sameCategory ? 0.3 : 0.1;
          const randomVariation = (Math.random() - 0.5) * 0.6;
          matrix[commodity1.name][commodity2.name] = Math.max(-1, Math.min(1, baseCorrelation + randomVariation));
        }
      });
    });
    
    return matrix;
  };

  const correlationMatrix = generateCorrelationMatrix();

  const getCorrelationColor = (correlation: number) => {
    const abs = Math.abs(correlation);
    if (abs >= 0.8) return correlation > 0 ? 'bg-green-500' : 'bg-red-500';
    if (abs >= 0.6) return correlation > 0 ? 'bg-green-400' : 'bg-red-400';
    if (abs >= 0.4) return correlation > 0 ? 'bg-green-300' : 'bg-red-300';
    if (abs >= 0.2) return correlation > 0 ? 'bg-green-200' : 'bg-red-200';
    return 'bg-gray-200';
  };

  const getCorrelationIntensity = (correlation: number) => {
    const abs = Math.abs(correlation);
    if (abs >= 0.8) return 'Very Strong';
    if (abs >= 0.6) return 'Strong';
    if (abs >= 0.4) return 'Moderate';
    if (abs >= 0.2) return 'Weak';
    return 'Very Weak';
  };

  const categories = ['all', ...Array.from(new Set((commodities || []).map((c: any) => c.category)))];

  return (
    <div className="container mx-auto p-3 lg:p-4 space-y-4 lg:space-y-6 max-w-7xl">
      {/* Header */}
      <div className="space-y-4">
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mb-2">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Dashboard
          </Button>
          <h1 className="text-2xl lg:text-3xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-6 h-6 lg:w-8 lg:h-8 text-primary" />
            Market Correlation
          </h1>
          <p className="text-sm lg:text-base text-muted-foreground mt-2">
            Discover how different commodities move together and identify market relationships
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3 lg:gap-4">{
          /* Mobile view controls */}
        <div className="flex flex-col sm:flex-row gap-2 lg:gap-4">
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Select timeframe" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">7 Days</SelectItem>
              <SelectItem value="30d">30 Days</SelectItem>
              <SelectItem value="90d">90 Days</SelectItem>
              <SelectItem value="1y">1 Year</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-full sm:w-[180px]">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.filter(cat => cat !== 'all').map(category => (
                <SelectItem key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          </div>

          {/* Mobile View Toggle - Only show on mobile */}
          {isMobile && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Display:</span>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3"
              >
                <Monitor className="w-4 h-4 mr-1" />
                Compact View
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Correlation Legend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base lg:text-lg">Correlation Legend</CardTitle>
          <CardDescription className="text-sm">
            Understanding correlation values and their meanings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className={`grid gap-4 ${isMobile ? 'grid-cols-1' : 'grid-cols-3'}`}>
            <div className="space-y-2">
              <h4 className="font-semibold text-green-700 dark:text-green-400">Positive Correlation</h4>
              <p className="text-muted-foreground">Commodities move in the same direction</p>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-green-500 rounded"></div>
                <span>+0.8 to +1.0 (Very Strong)</span>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-gray-700 dark:text-gray-400">No Correlation</h4>
              <p className="text-muted-foreground">Independent price movements</p>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-gray-200 rounded"></div>
                <span>-0.2 to +0.2 (Very Weak)</span>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-red-700 dark:text-red-400">Negative Correlation</h4>
              <p className="text-muted-foreground">Commodities move in opposite directions</p>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-red-500 rounded"></div>
                <span>-0.8 to -1.0 (Very Strong)</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Correlation Matrix */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base lg:text-lg">Correlation Matrix</CardTitle>
          <CardDescription className="text-sm">
            Showing correlations for {filteredCommodities.length} commodities over the last {timeframe}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredCommodities.length > 0 ? (
            isMobile ? (
              // Mobile view - Show simplified correlation pairs
              <div className="space-y-4">
                {filteredCommodities.map((commodity1, index) => (
                  <div key={`${commodity1.name}-${commodity1.symbol}-${index}`} className="space-y-2">
                    <h4 className="font-semibold text-sm border-b pb-1">{commodity1.name}</h4>
                    <div className="grid grid-cols-1 gap-2">
                      {filteredCommodities
                        .filter(c => c.name !== commodity1.name)
                        .sort((a, b) => {
                          const corrA = Math.abs(correlationMatrix[commodity1.name]?.[a.name] || 0);
                          const corrB = Math.abs(correlationMatrix[commodity1.name]?.[b.name] || 0);
                          return corrB - corrA;
                        })
                        .slice(0, 5) // Show top 5 correlations
                        .map((commodity2, idx) => {
                          const correlation = correlationMatrix[commodity1.name]?.[commodity2.name] || 0;
                          return (
                            <div key={`${commodity1.symbol}-${commodity2.symbol}-${idx}`} className="flex items-center justify-between p-3 rounded-lg border hover:shadow-md transition-all duration-200">
                              <div className="flex-1">
                                <div className="font-medium text-sm">{commodity2.name}</div>
                                <div className="text-xs text-muted-foreground">{commodity2.symbol}</div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge 
                                  variant="outline"
                                  className={`${getCorrelationColor(correlation)} border-0 text-white font-bold`}
                                >
                                  {correlation.toFixed(2)}
                                </Badge>
                                <div className="text-xs text-muted-foreground">
                                  {getCorrelationIntensity(correlation)}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* Desktop View - Matrix Format */
              <div className="overflow-x-auto">
                <div className="min-w-max">
                  {/* Header row */}
                  <div className="grid gap-1 mb-1" style={{ gridTemplateColumns: `200px repeat(${filteredCommodities.length}, 80px)` }}>
                    <div></div> {/* Empty corner */}
                    {filteredCommodities.map(commodity => (
                      <div key={commodity.name} className="p-2 text-xs font-medium text-center">
                        <div className="transform -rotate-45 origin-center">
                          <div className="truncate w-16">{commodity.symbol}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Matrix rows */}
                  {filteredCommodities.map((commodity1, idx1) => (
                    <div key={`${commodity1.name}-${commodity1.symbol}-row-${idx1}`} className="grid gap-1 mb-1" style={{ gridTemplateColumns: `200px repeat(${filteredCommodities.length}, 80px)` }}>
                      <div className="p-2 text-sm font-medium truncate">
                        {commodity1.name}
                      </div>
                      {filteredCommodities.map((commodity2, idx2) => {
                        const correlation = correlationMatrix[commodity1.name]?.[commodity2.name] || 0;
                        return (
                          <div 
                            key={`${commodity1.symbol}-${commodity2.symbol}-cell-${idx2}`}
                            className={`p-2 text-xs font-medium text-center rounded transition-colors cursor-pointer hover:opacity-80 ${getCorrelationColor(correlation)} ${
                              correlation > 0 ? 'text-white' : correlation < -0.5 ? 'text-white' : 'text-gray-800'
                            }`}
                            title={`${commodity1.name} vs ${commodity2.name}: ${correlation.toFixed(3)} (${getCorrelationIntensity(correlation)})`}
                          >
                            {correlation.toFixed(2)}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              No commodities available for the selected category
            </div>
          )}
        </CardContent>
      </Card>

      {/* Key Insights */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Key Insights</CardTitle>
          <CardDescription>
            Notable correlations and market relationships
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
              <TrendingUp className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Energy Complex</h4>
                <p className="text-sm text-muted-foreground">
                  Crude oil, gasoline, and heating oil typically show strong positive correlations due to shared refining processes and market dynamics.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
              <Activity className="w-5 h-5 text-blue-500 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Grain Markets</h4>
                <p className="text-sm text-muted-foreground">
                  Corn, wheat, and soybeans often move together during weather events and growing seasons, showing moderate to strong correlations.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
              <TrendingDown className="w-5 h-5 text-red-500 mt-0.5" />
              <div>
                <h4 className="font-semibold text-sm">Safe Haven Assets</h4>
                <p className="text-sm text-muted-foreground">
                  Gold and silver may show negative correlations with risk assets during market stress, acting as portfolio hedges.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

    </div>
  );
};

export default MarketCorrelation;