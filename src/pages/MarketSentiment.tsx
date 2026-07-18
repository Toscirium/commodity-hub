import React, { useState, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { SidebarInset } from "@/components/ui/sidebar";
import CommoditySidebar from "@/components/CommoditySidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, BarChart3, Users, Star, MessageCircle, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useCommodityCounts } from "@/hooks/useCommodityCounts";

interface SentimentAggregate {
  id: string;
  commodity_name: string;
  bullish_votes: number;
  bearish_votes: number;
  total_votes: number;
  average_confidence: number;
  last_updated: string;
}

interface SentimentVote {
  id: string;
  commodity_name: string;
  sentiment: 'bullish' | 'bearish';
  confidence: number;
  reasoning: string;
}

const POPULAR_COMMODITIES = [
  "Crude Oil", "Gold", "Silver", "Natural Gas", "Copper",
  "Wheat", "Corn", "Soybeans", "Coffee", "Sugar"
];

const MarketSentiment = () => {
  const [activeGroup, setActiveGroup] = useState("energy");
  const [sentimentData, setSentimentData] = useState<SentimentAggregate[]>([]);
  const [userVote, setUserVote] = useState<SentimentVote | null>(null);
  const [selectedCommodity, setSelectedCommodity] = useState("");
  const [selectedSentiment, setSelectedSentiment] = useState<'bullish' | 'bearish'>('bullish');
  const [confidence, setConfidence] = useState(3);
  const [reasoning, setReasoning] = useState("");
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const commodityCounts = useCommodityCounts();

  useEffect(() => {
    fetchSentimentData();
  }, []);

  const fetchSentimentData = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('sentiment_aggregates')
        .select('*')
        .order('total_votes', { ascending: false });
      
      if (error) throw error;
      setSentimentData(data || []);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load sentiment data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchUserVote = async (commodity: string) => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('sentiment_votes')
        .select('*')
        .eq('user_id', user.id)
        .eq('commodity_name', commodity)
        .single();
      
      if (error && error.code !== 'PGRST116') throw error;
      setUserVote(data as SentimentVote);
    } catch (error) {
      console.error('Error fetching user vote:', error);
    }
  };

  const submitVote = async () => {
    if (!user || !selectedCommodity) {
      toast({
        title: "Authentication Required",
        description: "Please sign in to submit your market sentiment",
        variant: "destructive",
      });
      return;
    }

    try {
      const { error } = await supabase
        .from('sentiment_votes')
        .upsert({
          user_id: user.id,
          commodity_name: selectedCommodity,
          sentiment: selectedSentiment,
          confidence: confidence,
          reasoning: reasoning
        });

      if (error) throw error;

      toast({
        title: "Vote Submitted",
        description: "Thank you for sharing your market sentiment!",
      });

      // Reset form
      setSelectedCommodity("");
      setReasoning("");
      setConfidence(3);
      
      // Refresh data
      fetchSentimentData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit vote",
        variant: "destructive",
      });
    }
  };

  const getSentimentPercentage = (bullish: number, bearish: number, type: 'bullish' | 'bearish') => {
    const total = bullish + bearish;
    if (total === 0) return 0;
    return type === 'bullish' ? (bullish / total) * 100 : (bearish / total) * 100;
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
              <BarChart3 className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-semibold">Market Sentiment</h1>
            </div>
          </header>

          <main className="flex-1 p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">
                  Community Market Sentiment
                </h2>
                <p className="text-muted-foreground">
                  See what the trading community thinks about commodity markets
                </p>
              </div>

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart3 className="h-5 w-5" />
                        Market Sentiment Overview
                      </CardTitle>
                      <CardDescription>
                        Real-time sentiment from our trading community
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {loading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        </div>
                      ) : sentimentData.length === 0 ? (
                        <div className="text-center py-8">
                          <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                          <p className="text-muted-foreground">No sentiment data available yet</p>
                        </div>
                      ) : (
                        <div className="space-y-6">
                          {sentimentData.map((item) => {
                            const bullishPercentage = getSentimentPercentage(
                              item.bullish_votes, 
                              item.bearish_votes, 
                              'bullish'
                            );
                            const bearishPercentage = getSentimentPercentage(
                              item.bullish_votes, 
                              item.bearish_votes, 
                              'bearish'
                            );

                            return (
                              <div key={item.id} className="space-y-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <h3 className="font-semibold">{item.commodity_name}</h3>
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                      <div className="flex items-center gap-1">
                                        <Users className="h-4 w-4" />
                                        <span>{item.total_votes} votes</span>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <span>Avg. Confidence:</span>
                                        {renderConfidenceStars(Math.round(item.average_confidence || 0))}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="flex items-center gap-2 mb-1">
                                      <TrendingUp className="h-4 w-4 text-green-500" />
                                      <span className="text-sm font-medium text-green-600">
                                        {bullishPercentage.toFixed(0)}%
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <TrendingDown className="h-4 w-4 text-red-500" />
                                      <span className="text-sm font-medium text-red-600">
                                        {bearishPercentage.toFixed(0)}%
                                      </span>
                                    </div>
                                  </div>
                                </div>
                                <div className="relative">
                                  <Progress value={bullishPercentage} className="h-3" />
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <span className="text-xs font-medium text-white mix-blend-difference">
                                      {item.bullish_votes} Bullish | {item.bearish_votes} Bearish
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div>
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MessageCircle className="h-5 w-5" />
                        Share Your Sentiment
                      </CardTitle>
                      <CardDescription>
                        Let the community know what you think
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Commodity
                        </label>
                        <Select value={selectedCommodity} onValueChange={setSelectedCommodity}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select commodity" />
                          </SelectTrigger>
                          <SelectContent>
                            {POPULAR_COMMODITIES.map((commodity) => (
                              <SelectItem key={commodity} value={commodity}>
                                {commodity}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Sentiment
                        </label>
                        <div className="flex gap-2">
                          <Button
                            variant={selectedSentiment === 'bullish' ? 'default' : 'outline'}
                            onClick={() => setSelectedSentiment('bullish')}
                            className="flex-1 gap-2"
                          >
                            <TrendingUp className="h-4 w-4" />
                            Bullish
                          </Button>
                          <Button
                            variant={selectedSentiment === 'bearish' ? 'default' : 'outline'}
                            onClick={() => setSelectedSentiment('bearish')}
                            className="flex-1 gap-2"
                          >
                            <TrendingDown className="h-4 w-4" />
                            Bearish
                          </Button>
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Confidence Level: {confidence}/5
                        </label>
                        <div className="flex gap-1">
                          {[1, 2, 3, 4, 5].map((level) => (
                            <Button
                              key={level}
                              variant="ghost"
                              size="sm"
                              onClick={() => setConfidence(level)}
                              className="p-1"
                            >
                              <Star
                                className={`h-5 w-5 ${
                                  level <= confidence 
                                    ? 'fill-yellow-400 text-yellow-400' 
                                    : 'text-gray-300'
                                }`}
                              />
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="text-sm font-medium mb-2 block">
                          Reasoning (Optional)
                        </label>
                        <Textarea
                          placeholder="Share your reasoning..."
                          value={reasoning}
                          onChange={(e) => setReasoning(e.target.value)}
                          className="min-h-[80px]"
                        />
                      </div>

                      <Button 
                        onClick={submitVote} 
                        className="w-full gap-2"
                        disabled={!selectedCommodity}
                      >
                        <MessageCircle className="h-4 w-4" />
                        Submit Vote
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default MarketSentiment;