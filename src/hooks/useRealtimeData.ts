import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { CommodityPrice } from './useCommodityData';
import { supabase } from '@/integrations/supabase/client';

interface UseRealtimeDataProps {
  commodities: string[];
  enabled?: boolean;
}

interface RealtimeDataHook {
  prices: Record<string, CommodityPrice>;
  connected: boolean;
  error: string | null;
  lastUpdate: Date | null;
}

export const useRealtimeData = ({ commodities, enabled = true }: UseRealtimeDataProps): RealtimeDataHook => {
  const { user, profile } = useAuth();
  const [prices, setPrices] = React.useState<Record<string, CommodityPrice>>({});
  const [connected, setConnected] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = React.useState<Date | null>(null);
  const wsRef = React.useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = React.useRef(0);

  const isPremium = profile?.subscription_active && 
    (profile?.subscription_tier === 'premium' || profile?.subscription_tier === 'pro');

  const connect = React.useCallback(async () => {
    // Temporarily disabled - WebSocket edge function not implemented yet
    console.log('Real-time WebSocket connection disabled - missing realtime-commodity-stream edge function');
    return;
    
    if (!user || !isPremium || !enabled || commodities.length === 0) {
      return;
    }

    try {
      // Get auth token from Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('No valid session found');
        return;
      }

      // Close existing connection
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }

      const wsUrl = new URL('wss://kcxhsmlqqyarhlmcapmj.supabase.co/functions/v1/realtime-commodity-stream');
      wsUrl.searchParams.set('token', session.access_token);
      wsUrl.searchParams.set('commodities', commodities.join(','));

      const ws = new WebSocket(wsUrl.toString());
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('Real-time commodity stream connected');
        setConnected(true);
        setError(null);
        reconnectAttempts.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          
          if (message.type === 'price_update') {
            setPrices(prevPrices => ({
              ...prevPrices,
              ...message.data
            }));
            setLastUpdate(new Date());
          } else if (message.type === 'connection_status') {
            console.log('Stream status:', message.message);
          }
        } catch (parseError) {
          console.error('Error parsing WebSocket message:', parseError);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setConnected(false);
        
        if (event.code !== 1000 && enabled && isPremium) {
          // Attempt to reconnect with exponential backoff
          const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
          reconnectAttempts.current++;
          
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Attempting to reconnect (attempt ${reconnectAttempts.current})`);
            connect();
          }, delay);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setError('Connection error occurred');
      };

      // Send periodic ping to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);

      // Cleanup interval when connection closes
      ws.addEventListener('close', () => {
        clearInterval(pingInterval);
      });

    } catch (connectError) {
      console.error('Error establishing WebSocket connection:', connectError);
      setError('Failed to establish real-time connection');
    }
  }, [user, isPremium, enabled, commodities]);

  React.useEffect(() => {
    if (isPremium && enabled && commodities.length > 0) {
      connect();
    } else {
      // Clean up connection if conditions not met
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
      setPrices({});
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return {
    prices,
    connected,
    error,
    lastUpdate
  };
};
