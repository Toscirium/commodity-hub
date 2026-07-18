import React, { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import CommoditySidebar from "@/components/CommoditySidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Lightbulb, TrendingUp, TrendingDown, Minus, Star, Calendar, Target, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useCommodityCounts } from "@/hooks/useCommodityCounts";

interface ExpertInsight {
  id: string;
  expert_name: string;
  expert_title: string;
  commodity_focus: string;
  title: string;
  content: string;
  prediction_timeframe: string;
  bullish_bearish: 'bullish' | 'bearish' | 'neutral';
  confidence_level: number;
  published_at: string;
}

const ExpertInsights = () => {
  const [activeGroup, setActiveGroup] = useState("energy");
  const [insights, setInsights] = useState<ExpertInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();
  const commodityCounts = useCommodityCounts();

  useEffect(() => {
    fetchInsights();
  }, [activeGroup]);

  const fetchInsights = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('expert_insights')
        .select('*')
        .ilike('commodity_focus', `%${activeGroup}%`)
        .order('published_at', { ascending: false });
      
      if (error) throw error;
      setInsights((data || []) as ExpertInsight[]);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load expert insights",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'bearish':
        return <TrendingDown className="h-4 w-4 text-red-500" />;
      default:
        return <Minus className="h-4 w-4 text-yellow-500" />;
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'bullish':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'bearish':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    }
  };

  const renderConfidenceStars = (level: number) => {
    return (
      <div className="flex gap-1">
        {[...Array(5)].map((_, i) => (
          <Star
            key={i}
            className={`h-3 w-3 ${
              i < level ? 'fill-yellow-400 text-yellow-400' : 'text-gray-300'
            }`}
          />
        ))}
      </div>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
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
              <Lightbulb className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">Expert Insights</h1>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-4xl mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  Market Analysis & Predictions
                </h2>
                <p className="text-muted-foreground">
                  Professional insights from commodity market experts
                </p>
              </div>

              <div className="grid gap-6">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                  </div>
                ) : insights.length === 0 ? (
                  <Card>
                    <CardContent className="flex flex-col items-center justify-center py-12">
                      <Lightbulb className="h-12 w-12 text-muted-foreground mb-4" />
                      <h3 className="text-lg font-semibold mb-2">No insights available</h3>
                      <p className="text-muted-foreground text-center">
                        Expert insights will appear here when available
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-6">
                    {insights.map((insight) => (
                      <Card key={insight.id} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <CardTitle className="text-xl mb-2">
                                {insight.title}
                              </CardTitle>
                              <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                                <div className="flex items-center gap-1">
                                  <Calendar className="h-4 w-4" />
                                  <span>{formatDate(insight.published_at)}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Target className="h-4 w-4" />
                                  <span>{insight.prediction_timeframe}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mb-3">
                                <Badge 
                                  variant="outline" 
                                  className={getSentimentColor(insight.bullish_bearish)}
                                >
                                  <div className="flex items-center gap-1">
                                    {getSentimentIcon(insight.bullish_bearish)}
                                    <span className="capitalize">{insight.bullish_bearish}</span>
                                  </div>
                                </Badge>
                                <div className="flex items-center gap-1">
                                  <span className="text-sm text-muted-foreground">Confidence:</span>
                                  {renderConfidenceStars(insight.confidence_level)}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="border-l-4 border-primary pl-4">
                            <div className="font-medium">{insight.expert_name}</div>
                            <div className="text-sm text-muted-foreground">
                              {insight.expert_title}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <div className="prose prose-sm max-w-none">
                            <p className="text-foreground leading-relaxed">
                              {insight.content}
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default ExpertInsights;