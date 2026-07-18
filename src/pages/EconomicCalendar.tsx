import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar, Clock, TrendingUp, AlertTriangle, Star, Loader, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';

interface EconomicEvent {
  id: string;
  title: string;
  description: string;
  date: string;
  time: string;
  impact: 'low' | 'medium' | 'high';
  country: string;
  category: string;
  previous?: string;
  forecast?: string;
  actual?: string;
  change?: number;
  changePercentage?: number;
  commodityImpact: string[];
}

const EconomicCalendar = () => {
  const navigate = useNavigate();
  const [selectedImpact, setSelectedImpact] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedCountry, setSelectedCountry] = useState('all');

  // Fetch 7 days back + 14 days ahead
  const now = new Date();
  const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const to = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['economic-calendar', from, to],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('economic-calendar', {
        body: { from, to }
      });
      if (error) throw error;
      return data;
    },
    staleTime: 5 * 60 * 1000, // 5 min
    refetchOnWindowFocus: false,
  });

  const events: EconomicEvent[] = data?.events || [];

  const getImpactColor = (impact: string) => {
    switch (impact) {
      case 'high':
        return 'bg-red-100 text-red-800 dark:bg-red-950/20 dark:text-red-400 border-red-200 dark:border-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/20 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800 dark:bg-green-950/20 dark:text-green-400 border-green-200 dark:border-green-800';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getImpactIcon = (impact: string) => {
    switch (impact) {
      case 'high': return <AlertTriangle className="w-4 h-4" />;
      case 'medium': return <TrendingUp className="w-4 h-4" />;
      case 'low': return <Star className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  const filteredEvents = events.filter(event => {
    if (selectedImpact !== 'all' && event.impact !== selectedImpact) return false;
    if (selectedCategory !== 'all' && event.category !== selectedCategory) return false;
    if (selectedCountry !== 'all' && event.country !== selectedCountry) return false;
    return true;
  });

  const groupedEvents = filteredEvents.reduce((acc, event) => {
    if (!acc[event.date]) acc[event.date] = [];
    acc[event.date].push(event);
    return acc;
  }, {} as Record<string, EconomicEvent[]>);

  const categories = Array.from(new Set(events.map(e => e.category))).sort();
  const countries = Array.from(new Set(events.map(e => e.country))).sort();
  const today = now.toISOString().split('T')[0];

  return (
    <div className="min-h-screen bg-background">
      <MobilePageHeader
        title="Economic Calendar"
        subtitle="Live economic events and their impact on commodity markets"
      />
      
      <div className="container mx-auto p-4 space-y-6">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <Select value={selectedImpact} onValueChange={setSelectedImpact}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Impact Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Impact Levels</SelectItem>
              <SelectItem value="high">High Impact</SelectItem>
              <SelectItem value="medium">Medium Impact</SelectItem>
              <SelectItem value="low">Low Impact</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedCategory} onValueChange={setSelectedCategory}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(category => (
                <SelectItem key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedCountry} onValueChange={setSelectedCountry}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Countries</SelectItem>
              {countries.map(country => (
                <SelectItem key={country} value={country}>{country}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {data?.count != null && (
            <span className="text-sm text-muted-foreground ml-auto">
              {filteredEvents.length} of {data.count} events
            </span>
          )}
        </div>

        {/* Loading state */}
        {isLoading && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader className="w-6 h-6 animate-spin text-primary mr-3" />
              <span className="text-muted-foreground">Loading economic events...</span>
            </CardContent>
          </Card>
        )}

        {/* Error state */}
        {error && !isLoading && (
          <Card>
            <CardContent className="text-center py-8">
              <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">Failed to load events</h3>
              <p className="text-muted-foreground mb-4">{error.message}</p>
              <Button onClick={() => refetch()}>Try Again</Button>
            </CardContent>
          </Card>
        )}

        {/* Calendar View */}
        {!isLoading && !error && (
          <div className="space-y-6">
            {Object.entries(groupedEvents)
              .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
              .map(([date, dateEvents]) => {
                const isToday = date === today;
                const isPast = date < today;
                return (
                  <Card key={date} className={isToday ? 'border-primary/50 shadow-md' : isPast ? 'opacity-75' : ''}>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Calendar className="w-5 h-5 text-primary" />
                        {new Date(date + 'T00:00:00').toLocaleDateString('en-US', { 
                          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
                        })}
                        {isToday && <Badge variant="default" className="ml-2">Today</Badge>}
                        {isPast && <Badge variant="secondary" className="ml-2">Past</Badge>}
                      </CardTitle>
                      <CardDescription>
                        {dateEvents.length} event{dateEvents.length !== 1 ? 's' : ''}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {dateEvents
                          .sort((a, b) => a.time.localeCompare(b.time))
                          .map(event => (
                          <div key={event.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-2">
                                  <Clock className="w-4 h-4 text-muted-foreground" />
                                  <span className="font-medium">{event.time || 'TBD'}</span>
                                </div>
                                <Badge variant="outline" className={`border ${getImpactColor(event.impact)}`}>
                                  <div className="flex items-center gap-1">
                                    {getImpactIcon(event.impact)}
                                    {event.impact.toUpperCase()}
                                  </div>
                                </Badge>
                                <Badge variant="secondary">{event.country}</Badge>
                                <Badge variant="outline" className="text-xs capitalize">{event.category}</Badge>
                              </div>
                            </div>

                            <div className="space-y-3">
                              <h4 className="font-semibold text-lg">{event.title}</h4>

                              {(event.previous || event.forecast || event.actual) && (
                                <div className="grid grid-cols-3 gap-4 bg-muted/30 rounded-lg p-3">
                                  {event.previous != null && (
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">Previous</p>
                                      <p className="font-semibold">{event.previous}</p>
                                    </div>
                                  )}
                                  {event.forecast != null && (
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">Forecast</p>
                                      <p className="font-semibold">{event.forecast}</p>
                                    </div>
                                  )}
                                  {event.actual != null && (
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">Actual</p>
                                      <p className="font-semibold text-primary">{event.actual}</p>
                                    </div>
                                  )}
                                </div>
                              )}

                              <div>
                                <p className="text-sm font-medium mb-2">Potential Commodity Impact:</p>
                                <div className="flex flex-wrap gap-2">
                                  {event.commodityImpact.map(commodity => (
                                    <Badge 
                                      key={commodity} 
                                      variant="outline" 
                                      className="text-xs cursor-pointer hover:bg-primary/10 hover:border-primary/50 transition-colors"
                                      onClick={() => navigate(`/?commodity=${encodeURIComponent(commodity)}`)}
                                    >
                                      {commodity} ↗
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
          </div>
        )}

        {!isLoading && !error && Object.keys(groupedEvents).length === 0 && (
          <Card>
            <CardContent className="text-center py-8">
              <Calendar className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold text-lg mb-2">No Events Found</h3>
              <p className="text-muted-foreground">No economic events match your current filters</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default EconomicCalendar;
