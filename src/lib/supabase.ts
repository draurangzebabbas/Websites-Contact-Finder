import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Database = {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          webhook_token: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          full_name: string;
          webhook_token?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          webhook_token?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      api_keys: {
        Row: {
          id: string;
          user_id: string;
          key_name: string;
          api_key: string;
          provider: string;
          status: string;
          credits_remaining: number;
          last_used: string | null;
          last_failed: string | null;
          failure_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          key_name: string;
          api_key: string;
          provider?: string;
          status?: string;
          credits_remaining?: number;
          last_used?: string | null;
          last_failed?: string | null;
          failure_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          key_name?: string;
          api_key?: string;
          provider?: string;
          status?: string;
          credits_remaining?: number;
          last_used?: string | null;
          last_failed?: string | null;
          failure_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      analysis_logs: {
        Row: {
          id: string;
          user_id: string;
          request_id: string;
          keywords: any;
          results: any | null;
          api_keys_used: any | null;
          status: string;
          error_message: string | null;
          processing_time: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          request_id: string;
          keywords: any;
          results?: any | null;
          api_keys_used?: any | null;
          status?: string;
          error_message?: string | null;
          processing_time?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          request_id?: string;
          keywords?: any;
          results?: any | null;
          api_keys_used?: any | null;
          status?: string;
          error_message?: string | null;
          processing_time?: number | null;
          created_at?: string;
        };
      };
    };
  };
};
