import {
  UserRole,
  AccountStatus,
  RequestStatus,
  UnlockMethodType,
  CoverGameType,
} from './database';

export * from './database';

export interface UserProfile {
  id: string;
  uid: string;
  username?: string;
  display_name: string;
  avatar_url: string | null;
  biometric_enabled?: boolean;
  role: UserRole;
  status: AccountStatus;
  created_at: string;
  last_login_at?: string;
  updated_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  custom_app_name: string;
  selected_icon: string;
  selected_game: CoverGameType;
  unlock_method: UnlockMethodType;
  unlock_secret_hash: string;
  theme_preference: string;
  auto_lock_seconds: number;
}

export interface ConnectionRequestItem {
  id: string;
  sender_id: string;
  receiver_id: string;
  status: RequestStatus;
  created_at: string;
  sender?: UserProfile;
  receiver?: UserProfile;
}

export interface ConnectionItem {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  partner: UserProfile;
}

export interface ConversationItem {
  id: string;
  user_a: string;
  user_b: string;
  created_at: string;
  updated_at: string;
  partner: UserProfile;
  lastMessage?: MessageItem;
  unreadCount: number;
  isPartnerTyping?: boolean;
}

export interface MessageItem {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  sender?: UserProfile;
}

export interface GalleryItem {
  id: string;
  user_id: string;
  image_url: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
}

export interface AdminAccessLogItem {
  id: string;
  admin_id: string | null;
  action_type: string;
  target_user_id: string | null;
  target_resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  admin?: UserProfile;
  targetUser?: UserProfile;
}

export interface CoverGameMeta {
  id: CoverGameType;
  name: string;
  tagline: string;
  icon: string;
  color: string;
  implemented: boolean;
}

export type SocialTab = 'chats' | 'gallery' | 'profile' | 'messages' | 'home' | 'connections' | 'settings';
export type AdminTab = 'dashboard' | 'users' | 'messages' | 'gallery' | 'audit_log';
