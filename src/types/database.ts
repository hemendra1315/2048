export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'user' | 'super_admin';
export type AccountStatus = 'active' | 'suspended' | 'banned';
export type RequestStatus = 'pending' | 'accepted' | 'rejected';
export type UnlockMethodType = 'pin' | 'long_press_header' | 'tile_pattern' | 'secret_gesture' | 'score_threshold';
export type CoverGameType =
  | 'game_2048'
  | 'snake'
  | 'tic_tac_toe'
  | 'sudoku'
  | 'minesweeper'
  | 'brick_breaker'
  | 'memory_match'
  | 'bubble_shooter'
  | 'block_puzzle'
  | 'flappy_bird';

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          uid: string;
          display_name: string;
          avatar_url: string | null;
          role: UserRole;
          status: AccountStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          uid?: string;
          display_name: string;
          avatar_url?: string | null;
          role?: UserRole;
          status?: AccountStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          uid?: string;
          display_name?: string;
          avatar_url?: string | null;
          role?: UserRole;
          status?: AccountStatus;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_preferences: {
        Row: {
          id: string;
          user_id: string;
          custom_app_name: string;
          selected_icon: string;
          selected_game: CoverGameType;
          unlock_method: UnlockMethodType;
          unlock_secret_hash: string;
          theme_preference: string;
          auto_lock_seconds: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          custom_app_name?: string;
          selected_icon?: string;
          selected_game?: CoverGameType;
          unlock_method?: UnlockMethodType;
          unlock_secret_hash: string;
          theme_preference?: string;
          auto_lock_seconds?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          custom_app_name?: string;
          selected_icon?: string;
          selected_game?: CoverGameType;
          unlock_method?: UnlockMethodType;
          unlock_secret_hash?: string;
          theme_preference?: string;
          auto_lock_seconds?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      game_preferences: {
        Row: {
          id: string;
          user_id: string;
          selected_game: CoverGameType;
          sound_enabled: boolean;
          haptics_enabled: boolean;
          difficulty: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          selected_game?: CoverGameType;
          sound_enabled?: boolean;
          haptics_enabled?: boolean;
          difficulty?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          selected_game?: CoverGameType;
          sound_enabled?: boolean;
          haptics_enabled?: boolean;
          difficulty?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      game_progress: {
        Row: {
          id: string;
          user_id: string;
          game_name: CoverGameType;
          high_score: number;
          progress_data: Json;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          game_name: CoverGameType;
          high_score?: number;
          progress_data?: Json;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          game_name?: CoverGameType;
          high_score?: number;
          progress_data?: Json;
          updated_at?: string;
        };
      };
      connection_requests: {
        Row: {
          id: string;
          sender_id: string;
          receiver_id: string;
          status: RequestStatus;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          sender_id: string;
          receiver_id: string;
          status?: RequestStatus;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          sender_id?: string;
          receiver_id?: string;
          status?: RequestStatus;
          created_at?: string;
          updated_at?: string;
        };
      };
      connections: {
        Row: {
          id: string;
          user_a: string;
          user_b: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_a: string;
          user_b: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_a?: string;
          user_b?: string;
          created_at?: string;
        };
      };
      user_blocks: {
        Row: {
          id: string;
          blocker_id: string;
          blocked_id: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          blocker_id: string;
          blocked_id: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          blocker_id?: string;
          blocked_id?: string;
          created_at?: string;
        };
      };
      conversations: {
        Row: {
          id: string;
          user_a: string;
          user_b: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_a: string;
          user_b: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_a?: string;
          user_b?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      conversation_members: {
        Row: {
          id: string;
          conversation_id: string;
          user_id: string;
          last_read_at: string;
          is_typing: boolean;
          typing_updated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          user_id: string;
          last_read_at?: string;
          is_typing?: boolean;
          typing_updated_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          user_id?: string;
          last_read_at?: string;
          is_typing?: boolean;
          typing_updated_at?: string;
          created_at?: string;
        };
      };
      messages: {
        Row: {
          id: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          is_read: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          sender_id: string;
          content: string;
          is_read?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          conversation_id?: string;
          sender_id?: string;
          content?: string;
          is_read?: boolean;
          created_at?: string;
        };
      };
      gallery_items: {
        Row: {
          id: string;
          user_id: string;
          image_url: string;
          storage_path: string;
          caption: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          image_url: string;
          storage_path: string;
          caption?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          image_url?: string;
          storage_path?: string;
          caption?: string | null;
          created_at?: string;
        };
      };
      admin_access_log: {
        Row: {
          id: string;
          admin_id: string | null;
          action_type: string;
          target_user_id: string | null;
          target_resource_id: string | null;
          metadata: Json;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          action_type: string;
          target_user_id?: string | null;
          target_resource_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          admin_id?: string | null;
          action_type?: string;
          target_user_id?: string | null;
          target_resource_id?: string | null;
          metadata?: Json;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
      };
    };
    Functions: {
      is_super_admin: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      verify_vault_unlock: {
        Args: { p_secret: string };
        Returns: Json;
      };
      update_vault_unlock: {
        Args: { p_old_secret: string; p_new_secret: string };
        Returns: Json;
      };
      update_my_profile: {
        Args: { p_display_name?: string | null; p_avatar_url?: string | null; p_disable_biometrics?: boolean };
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      admin_set_user_status: {
        Args: { p_target: string; p_status: AccountStatus; p_reason?: string | null };
        Returns: Database['public']['Tables']['profiles']['Row'];
      };
      admin_delete_gallery_item: {
        Args: { p_item_id: string };
        Returns: string;
      };
      lookup_profile_by_uid: {
        Args: { lookup_uid: string };
        Returns: { id: string; uid: string; display_name: string; avatar_url: string | null }[];
      };
      log_admin_action: {
        Args: {
          p_action_type: string;
          p_target_user_id: string | null;
          p_target_resource_id: string | null;
          p_metadata?: Json;
        };
        Returns: string;
      };
    };
  };
}
