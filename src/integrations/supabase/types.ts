export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      affiliate_referral_clicks: {
        Row: {
          clicked_at: string
          commodity_symbol: string
          id: string
          provider: string
          user_id: string | null
        }
        Insert: {
          clicked_at?: string
          commodity_symbol: string
          id?: string
          provider: string
          user_id?: string | null
        }
        Update: {
          clicked_at?: string
          commodity_symbol?: string
          id?: string
          provider?: string
          user_id?: string | null
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          created_at: string
          id: string
          parts: Json
          role: string
          thread_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          parts?: Json
          role: string
          thread_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          parts?: Json
          role?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "ai_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_threads: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      analytics_snapshots: {
        Row: {
          as_of: string
          key: string
          kind: string
          payload: Json
        }
        Insert: {
          as_of?: string
          key: string
          kind: string
          payload: Json
        }
        Update: {
          as_of?: string
          key?: string
          kind?: string
          payload?: Json
        }
        Relationships: []
      }
      api_rate_limits: {
        Row: {
          api_endpoint: string
          created_at: string | null
          id: string
          request_count: number | null
          user_id: string | null
          window_start: string | null
        }
        Insert: {
          api_endpoint: string
          created_at?: string | null
          id?: string
          request_count?: number | null
          user_id?: string | null
          window_start?: string | null
        }
        Update: {
          api_endpoint?: string
          created_at?: string | null
          id?: string
          request_count?: number | null
          user_id?: string | null
          window_start?: string | null
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          new_values: Json | null
          old_values: Json | null
          session_id: string | null
          user_agent: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          session_id?: string | null
          user_agent?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          new_values?: Json | null
          old_values?: Json | null
          session_id?: string | null
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      commodity_history_snapshots: {
        Row: {
          commodity_name: string
          data: Json
          ohlc_available: boolean
          source: string
          timeframe: string
          updated_at: string
        }
        Insert: {
          commodity_name: string
          data: Json
          ohlc_available?: boolean
          source?: string
          timeframe: string
          updated_at?: string
        }
        Update: {
          commodity_name?: string
          data?: Json
          ohlc_available?: boolean
          source?: string
          timeframe?: string
          updated_at?: string
        }
        Relationships: []
      }
      commodity_price_snapshots: {
        Row: {
          commodity_name: string
          created_at: string
          id: string
          price: number
          snapshot_date: string
        }
        Insert: {
          commodity_name: string
          created_at?: string
          id?: string
          price: number
          snapshot_date?: string
        }
        Update: {
          commodity_name?: string
          created_at?: string
          id?: string
          price?: number
          snapshot_date?: string
        }
        Relationships: []
      }
      cot_reports: {
        Row: {
          commercials_long: number
          commercials_short: number
          commodity: string
          created_at: string
          id: string
          managed_money_long: number
          managed_money_short: number
          net_position: number
          open_interest: number
          report_date: string
        }
        Insert: {
          commercials_long?: number
          commercials_short?: number
          commodity: string
          created_at?: string
          id?: string
          managed_money_long?: number
          managed_money_short?: number
          net_position?: number
          open_interest?: number
          report_date: string
        }
        Update: {
          commercials_long?: number
          commercials_short?: number
          commodity?: string
          created_at?: string
          id?: string
          managed_money_long?: number
          managed_money_short?: number
          net_position?: number
          open_interest?: number
          report_date?: string
        }
        Relationships: []
      }
      device_tokens: {
        Row: {
          created_at: string
          id: string
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      expert_insights: {
        Row: {
          bullish_bearish: string | null
          commodity_focus: string
          confidence_level: number | null
          content: string
          created_at: string
          expert_name: string
          expert_title: string | null
          id: string
          prediction_timeframe: string | null
          published_at: string
          title: string
        }
        Insert: {
          bullish_bearish?: string | null
          commodity_focus: string
          confidence_level?: number | null
          content: string
          created_at?: string
          expert_name: string
          expert_title?: string | null
          id?: string
          prediction_timeframe?: string | null
          published_at?: string
          title: string
        }
        Update: {
          bullish_bearish?: string | null
          commodity_focus?: string
          confidence_level?: number | null
          content?: string
          created_at?: string
          expert_name?: string
          expert_title?: string | null
          id?: string
          prediction_timeframe?: string | null
          published_at?: string
          title?: string
        }
        Relationships: []
      }
      fundamentals_snapshots: {
        Row: {
          dataset: string
          five_year_avg: number | null
          label: string
          latest_period: string | null
          latest_value: number | null
          metadata: Json | null
          observations: Json
          series_id: string
          unit: string | null
          updated_at: string
          wow_change: number | null
          yoy_change: number | null
        }
        Insert: {
          dataset: string
          five_year_avg?: number | null
          label: string
          latest_period?: string | null
          latest_value?: number | null
          metadata?: Json | null
          observations?: Json
          series_id: string
          unit?: string | null
          updated_at?: string
          wow_change?: number | null
          yoy_change?: number | null
        }
        Update: {
          dataset?: string
          five_year_avg?: number | null
          label?: string
          latest_period?: string | null
          latest_value?: number | null
          metadata?: Json | null
          observations?: Json
          series_id?: string
          unit?: string | null
          updated_at?: string
          wow_change?: number | null
          yoy_change?: number | null
        }
        Relationships: []
      }
      glossary_terms: {
        Row: {
          category: string | null
          created_at: string
          definition: string
          examples: string | null
          id: string
          term: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          definition: string
          examples?: string | null
          id?: string
          term: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          definition?: string
          examples?: string | null
          id?: string
          term?: string
          updated_at?: string
        }
        Relationships: []
      }
      market_status_config: {
        Row: {
          close_time: string
          created_at: string
          holidays: Json | null
          id: string
          market_name: string
          open_time: string
          timezone: string
          trading_days: number[]
          updated_at: string
        }
        Insert: {
          close_time: string
          created_at?: string
          holidays?: Json | null
          id?: string
          market_name: string
          open_time: string
          timezone: string
          trading_days: number[]
          updated_at?: string
        }
        Update: {
          close_time?: string
          created_at?: string
          holidays?: Json | null
          id?: string
          market_name?: string
          open_time?: string
          timezone?: string
          trading_days?: number[]
          updated_at?: string
        }
        Relationships: []
      }
      portfolio_positions: {
        Row: {
          broker: string | null
          closed_date: string | null
          commodity_name: string
          created_at: string
          entry_date: string
          entry_price: number
          exit_price: number | null
          external_id: string | null
          id: string
          leverage: number | null
          notes: string | null
          portfolio_id: string | null
          quantity: number
          side: string
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          broker?: string | null
          closed_date?: string | null
          commodity_name: string
          created_at?: string
          entry_date?: string
          entry_price: number
          exit_price?: number | null
          external_id?: string | null
          id?: string
          leverage?: number | null
          notes?: string | null
          portfolio_id?: string | null
          quantity: number
          side?: string
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          broker?: string | null
          closed_date?: string | null
          commodity_name?: string
          created_at?: string
          entry_date?: string
          entry_price?: number
          exit_price?: number | null
          external_id?: string | null
          id?: string
          leverage?: number | null
          notes?: string | null
          portfolio_id?: string | null
          quantity?: number
          side?: string
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      portfolios: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      price_alert_triggers: {
        Row: {
          alert_id: string
          commodity_name: string
          condition: string
          dismissed_at: string | null
          id: string
          target_price: number
          triggered_at: string
          triggered_price: number
          user_id: string
        }
        Insert: {
          alert_id: string
          commodity_name: string
          condition: string
          dismissed_at?: string | null
          id?: string
          target_price: number
          triggered_at?: string
          triggered_price: number
          user_id: string
        }
        Update: {
          alert_id?: string
          commodity_name?: string
          condition?: string
          dismissed_at?: string | null
          id?: string
          target_price?: number
          triggered_at?: string
          triggered_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_alert_triggers_alert_id_fkey"
            columns: ["alert_id"]
            isOneToOne: false
            referencedRelation: "price_alerts"
            referencedColumns: ["id"]
          },
        ]
      }
      price_alerts: {
        Row: {
          alert_type: string
          commodity_name: string
          commodity_symbol: string | null
          condition: string | null
          config: Json | null
          cooldown_minutes: number
          created_at: string
          id: string
          is_active: boolean
          last_triggered_at: string | null
          note: string | null
          target_price: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          alert_type?: string
          commodity_name: string
          commodity_symbol?: string | null
          condition?: string | null
          config?: Json | null
          cooldown_minutes?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          note?: string | null
          target_price?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          alert_type?: string
          commodity_name?: string
          commodity_symbol?: string | null
          condition?: string | null
          config?: Json | null
          cooldown_minutes?: number
          created_at?: string
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          note?: string | null
          target_price?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      price_comparisons: {
        Row: {
          commodities: Json
          comparison_name: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          commodities: Json
          comparison_name: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          commodities?: Json
          comparison_name?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pro_analytics_cache: {
        Row: {
          key: string
          payload: Json
          updated_at: string
        }
        Insert: {
          key: string
          payload: Json
          updated_at?: string
        }
        Update: {
          key?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      pro_daily_briefs: {
        Row: {
          brief_date: string
          created_at: string
          headline: string
          id: string
          read_at: string | null
          sections: Json
          user_id: string
        }
        Insert: {
          brief_date: string
          created_at?: string
          headline: string
          id?: string
          read_at?: string | null
          sections?: Json
          user_id: string
        }
        Update: {
          brief_date?: string
          created_at?: string
          headline?: string
          id?: string
          read_at?: string | null
          sections?: Json
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          billing_state: string
          created_at: string
          email: string
          full_name: string | null
          grace_period_expires_at: string | null
          id: string
          subscription_active: boolean | null
          subscription_end: string | null
          subscription_store: string | null
          subscription_tier: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          billing_state?: string
          created_at?: string
          email: string
          full_name?: string | null
          grace_period_expires_at?: string | null
          id: string
          subscription_active?: boolean | null
          subscription_end?: string | null
          subscription_store?: string | null
          subscription_tier?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          billing_state?: string
          created_at?: string
          email?: string
          full_name?: string | null
          grace_period_expires_at?: string | null
          id?: string
          subscription_active?: boolean | null
          subscription_end?: string | null
          subscription_store?: string | null
          subscription_tier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      recent_activities: {
        Row: {
          activity_type: string
          commodity_name: string
          commodity_symbol: string | null
          created_at: string
          id: string
          metadata: Json | null
          user_id: string
        }
        Insert: {
          activity_type?: string
          commodity_name: string
          commodity_symbol?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          user_id: string
        }
        Update: {
          activity_type?: string
          commodity_name?: string
          commodity_symbol?: string | null
          created_at?: string
          id?: string
          metadata?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      sentiment_aggregates: {
        Row: {
          average_confidence: number | null
          bearish_votes: number
          bullish_votes: number
          commodity_name: string
          id: string
          last_updated: string
          total_votes: number
        }
        Insert: {
          average_confidence?: number | null
          bearish_votes?: number
          bullish_votes?: number
          commodity_name: string
          id?: string
          last_updated?: string
          total_votes?: number
        }
        Update: {
          average_confidence?: number | null
          bearish_votes?: number
          bullish_votes?: number
          commodity_name?: string
          id?: string
          last_updated?: string
          total_votes?: number
        }
        Relationships: []
      }
      sentiment_votes: {
        Row: {
          commodity_name: string
          confidence: number
          created_at: string
          id: string
          reasoning: string | null
          sentiment: string
          user_id: string
        }
        Insert: {
          commodity_name: string
          confidence: number
          created_at?: string
          id?: string
          reasoning?: string | null
          sentiment: string
          user_id: string
        }
        Update: {
          commodity_name?: string
          confidence?: number
          created_at?: string
          id?: string
          reasoning?: string | null
          sentiment?: string
          user_id?: string
        }
        Relationships: []
      }
      subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          stripe_customer_id: string | null
          subscribed: boolean
          subscription_end: string | null
          subscription_tier: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          stripe_customer_id?: string | null
          subscribed?: boolean
          subscription_end?: string | null
          subscription_tier?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      system_metrics: {
        Row: {
          created_at: string | null
          id: string
          metadata: Json | null
          metric_name: string
          metric_value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_name: string
          metric_value: number
        }
        Update: {
          created_at?: string | null
          id?: string
          metadata?: Json | null
          metric_name?: string
          metric_value?: number
        }
        Relationships: []
      }
      tutorial_categories: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      tutorials: {
        Row: {
          category_id: string
          content: string
          created_at: string
          description: string | null
          difficulty_level: string
          estimated_time_minutes: number | null
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          category_id: string
          content: string
          created_at?: string
          description?: string | null
          difficulty_level: string
          estimated_time_minutes?: number | null
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          content?: string
          created_at?: string
          description?: string | null
          difficulty_level?: string
          estimated_time_minutes?: number | null
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tutorials_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tutorial_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_favorites: {
        Row: {
          added_at: string
          commodity_group: string | null
          commodity_name: string
          commodity_symbol: string | null
          id: string
          user_id: string
        }
        Insert: {
          added_at?: string
          commodity_group?: string | null
          commodity_name: string
          commodity_symbol?: string | null
          id?: string
          user_id: string
        }
        Update: {
          added_at?: string
          commodity_group?: string | null
          commodity_name?: string
          commodity_symbol?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_spreads: {
        Row: {
          created_at: string
          formula: Json
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          formula: Json
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          formula?: Json
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      watchlist_items: {
        Row: {
          added_at: string
          commodity_name: string
          commodity_symbol: string | null
          id: string
          position: number
          user_id: string
          watchlist_id: string
        }
        Insert: {
          added_at?: string
          commodity_name: string
          commodity_symbol?: string | null
          id?: string
          position?: number
          user_id: string
          watchlist_id: string
        }
        Update: {
          added_at?: string
          commodity_name?: string
          commodity_symbol?: string | null
          id?: string
          position?: number
          user_id?: string
          watchlist_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_items_watchlist_id_fkey"
            columns: ["watchlist_id"]
            isOneToOne: false
            referencedRelation: "watchlists"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlists: {
        Row: {
          color: string
          created_at: string
          id: string
          is_default: boolean
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      cleanup_old_metrics: { Args: never; Returns: undefined }
      get_current_user_profile: {
        Args: never
        Returns: {
          avatar_url: string | null
          billing_state: string
          created_at: string
          email: string
          full_name: string | null
          grace_period_expires_at: string | null
          id: string
          subscription_active: boolean | null
          subscription_end: string | null
          subscription_tier: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_user_tier: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_business_hours: { Args: never; Returns: boolean }
      mask_email: {
        Args: {
          email_address: string
          owner_id: string
          requesting_user_id: string
        }
        Returns: string
      }
      validate_session: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
    },
  },
} as const
