import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Settings, Check, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { secureStorage } from '@/utils/security';

const NewsSettings: React.FC = () => {
  const { toast } = useToast();
  const [apiKeys, setApiKeys] = React.useState({
    marketauxApiKey: '',
  });

  const [testResults, setTestResults] = React.useState<Record<string, boolean>>({});
  const [testing, setTesting] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    const loadKeys = async () => {
      const marketaux = await secureStorage.getItem('marketauxApiKey') || '';
      setApiKeys({ marketauxApiKey: marketaux });
    };
    loadKeys();
  }, []);

  const handleSave = async (keyName: string, value: string) => {
    await secureStorage.setItem(keyName, value);
    setApiKeys(prev => ({ ...prev, [keyName]: value }));
    toast({
      title: "API Key Saved",
      description: `API key has been saved securely.`,
    });
  };

  const handleTest = async (keyName: string, apiKey: string) => {
    if (!apiKey.trim()) return;
    
    setTesting(prev => ({ ...prev, [keyName]: true }));
    
    try {
      let isValid = false;
      
      switch (keyName) {
        case 'marketauxApiKey': {
          const marketauxResponse = await fetch(`https://api.marketaux.com/v1/news/all?api_token=${apiKey}&limit=1`);
          isValid = marketauxResponse.ok;
          break;
        }
      }
      
      setTestResults(prev => ({ ...prev, [keyName]: isValid }));
      
      toast({
        title: isValid ? "API Key Valid" : "API Key Invalid",
        description: isValid ? "API key is working correctly." : "API key failed validation.",
        variant: isValid ? "default" : "destructive",
      });
      
    } catch (error) {
      setTestResults(prev => ({ ...prev, [keyName]: false }));
      toast({
        title: "Test Failed",
        description: "Unable to test API key. Please check your connection.",
        variant: "destructive",
      });
    } finally {
      setTesting(prev => ({ ...prev, [keyName]: false }));
    }
  };

  const apiSources = [
    {
      key: 'marketauxApiKey',
      name: 'Marketaux',
      description: 'Real-time financial news aggregator with market sentiment',
      placeholder: 'Your Marketaux API token',
      website: 'https://www.marketaux.com/',
      priority: 'Primary'
    }
  ];

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Primary': return 'bg-green-100 dark:bg-green-950/20 text-green-800 dark:text-green-300';
      default: return 'bg-gray-100 dark:bg-gray-950/20 text-gray-800 dark:text-gray-300';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          News API Configuration
        </CardTitle>
        <CardDescription>
          Configure API keys for enhanced news sources. More sources = better news coverage.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {apiSources.map((source, index) => (
          <div key={source.key}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Label htmlFor={source.key} className="font-semibold">
                    {source.name}
                  </Label>
                  <Badge className={getPriorityColor(source.priority)}>
                    {source.priority}
                  </Badge>
                  {testResults[source.key] !== undefined && (
                    <Badge variant={testResults[source.key] ? "default" : "destructive"}>
                      {testResults[source.key] ? (
                        <><Check className="w-3 h-3 mr-1" />Valid</>
                      ) : (
                        <><AlertCircle className="w-3 h-3 mr-1" />Invalid</>
                      )}
                    </Badge>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(source.website, '_blank')}
                >
                  Get API Key
                </Button>
              </div>
              
              <p className="text-sm text-muted-foreground">
                {source.description}
              </p>
              
              <div className="flex gap-2">
                <div className="flex-1">
                  <Input
                    id={source.key}
                    type="password"
                    placeholder={source.placeholder}
                    value={apiKeys[source.key as keyof typeof apiKeys]}
                    onChange={(e) => setApiKeys(prev => ({ 
                      ...prev, 
                      [source.key]: e.target.value 
                    }))}
                  />
                </div>
                <Button
                  variant="outline"
                  onClick={() => handleSave(source.key, apiKeys[source.key as keyof typeof apiKeys])}
                  disabled={!apiKeys[source.key as keyof typeof apiKeys].trim()}
                >
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleTest(source.key, apiKeys[source.key as keyof typeof apiKeys])}
                  disabled={!apiKeys[source.key as keyof typeof apiKeys].trim() || testing[source.key]}
                >
                  {testing[source.key] ? 'Testing...' : 'Test'}
                </Button>
              </div>
            </div>
            
            {index < apiSources.length - 1 && <Separator className="mt-6" />}
          </div>
        ))}
        
        <div className="bg-blue-50 dark:bg-blue-950/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800">
          <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
            💡 Pro Tips for Better News
          </h4>
          <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
            <li>• Configure both API keys for comprehensive news coverage</li>
            <li>• Primary sources provide the most relevant financial news</li>
            <li>• Test your API keys regularly to ensure they're working</li>
            <li>• APIs have rate limits - the app will handle this automatically</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

export default NewsSettings;
