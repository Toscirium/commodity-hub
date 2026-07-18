import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Settings, Key, Save, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { secureStorage } from '@/utils/security';

const ApiSettings = () => {
  const [newsApiKey, setNewsApiKey] = React.useState('');
  const [alphaVantageApiKey, setAlphaVantageApiKey] = React.useState('');
  const [showNews, setShowNews] = React.useState(false);
  const [showAlpha, setShowAlpha] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    const loadKeys = async () => {
      const savedNews = await secureStorage.getItem('newsApiKey');
      const savedAlpha = await secureStorage.getItem('alphaVantageApiKey');
      if (savedNews) setNewsApiKey(savedNews);
      if (savedAlpha) setAlphaVantageApiKey(savedAlpha);
    };
    loadKeys();
  }, []);

  const handleSave = async () => {
    try {
      if (newsApiKey) {
        await secureStorage.setItem('newsApiKey', newsApiKey);
      }
      if (alphaVantageApiKey) {
        await secureStorage.setItem('alphaVantageApiKey', alphaVantageApiKey);
      }
      toast.success('API keys saved successfully!');
      setIsOpen(false);
      window.location.reload();
    } catch (error) {
      toast.error('Failed to save API keys');
    }
  };

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        variant="outline"
        size="sm"
        className="fixed bottom-4 right-4 z-50 shadow-lg"
      >
        <Settings className="w-4 h-4 mr-2" />
        API Settings
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl p-6 bg-background border border-border shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-foreground">API Settings</h3>
            <p className="text-sm text-muted-foreground">Configure your API keys for comprehensive commodity news</p>
          </div>
        </div>

        <div className="space-y-6">
          {/* NewsAPI */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="news-key">NewsAPI Key</Label>
              <a
                href="https://newsapi.org/register"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-xs flex items-center gap-1"
              >
                Get API Key <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="relative">
              <Input
                id="news-key"
                type={showNews ? "text" : "password"}
                value={newsApiKey}
                onChange={(e) => setNewsApiKey(e.target.value)}
                placeholder="Enter your NewsAPI key (optional)"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowNews(!showNews)}
              >
                {showNews ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Provides comprehensive news coverage from thousands of sources
            </p>
          </div>

          {/* Alpha Vantage API */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="alpha-key">Alpha Vantage API Key</Label>
              <a
                href="https://www.alphavantage.co/support/#api-key"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-xs flex items-center gap-1"
              >
                Get API Key <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="relative">
              <Input
                id="alpha-key"
                type={showAlpha ? "text" : "password"}
                value={alphaVantageApiKey}
                onChange={(e) => setAlphaVantageApiKey(e.target.value)}
                placeholder="Enter your Alpha Vantage key (optional)"
                className="pr-10"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowAlpha(!showAlpha)}
              >
                {showAlpha ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Provides news sentiment analysis and financial market intelligence
            </p>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <Button onClick={handleSave} className="flex-1">
            <Save className="w-4 h-4 mr-2" />
            Save Keys
          </Button>
          <Button onClick={() => setIsOpen(false)} variant="outline">
            Cancel
          </Button>
        </div>

        <div className="mt-4 p-4 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground">
            <strong>News Sources:</strong> The app combines news from NewsAPI and Alpha Vantage.
            Commodity prices come from CommodityPriceAPI and OilPriceAPI (managed in backend secrets).
            Your API keys are encrypted and stored locally in your browser.
          </p>
        </div>
      </Card>
    </div>
  );
};

export default ApiSettings;
