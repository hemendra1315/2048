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
  gender?: 'Male' | 'Female' | string | null;
  instagram_url?: string | null;
  biometric_enabled?: boolean;
  role: UserRole;
  status: AccountStatus;
  created_at: string;
  last_login_at?: string;
  updated_at: string;
}

export interface AdminMediaUploadItem {
  id: string;
  admin_id: string | null;
  image_url: string;
  storage_path: string;
  created_at: string;
}

export type SharedVaultMediaType = 'image' | 'video' | 'audio' | 'text_memory' | 'document' | 'link';

export interface SharedVaultAlbum {
  id: string;
  conversation_id: string;
  created_by: string;
  title: string;
  description?: string | null;
  cover_url?: string | null;
  gradient_preset?: string;
  is_locked?: boolean;
  created_at: string;
  updated_at: string;
  item_count?: number;
}

export type VaultNavigationState =
  | { view: 'root' }
  | { view: 'album'; album: SharedVaultAlbum }
  | { view: 'trash' };

export interface SharedVaultItem {
  id: string;
  conversation_id: string;
  saved_by: string;
  album_id?: string | null;
  message_id?: string | null;
  media_type: SharedVaultMediaType;
  media_url: string;
  storage_path?: string | null;
  caption?: string | null;
  memory_date: string;
  file_name?: string | null;
  file_size?: number | null;
  mime_type?: string | null;
  duration_seconds?: number | null;
  deleted_at?: string | null;
  tags?: string[];
  metadata?: {
    duration?: string;
    waveform?: string;
    width?: number;
    height?: number;
    quote_author?: string;
    link_title?: string;
    link_domain?: string;
  };
  is_favorite: boolean;
  starred_by: string[];
  created_at: string;
  updated_at: string;
}

export interface AdminSharedVaultSummary {
  conversation_id: string;
  user_a: UserProfile;
  user_b: UserProfile;
  total_photos: number;
  total_videos: number;
  total_audio: number;
  total_text_memories: number;
  last_activity_at: string;
  created_at: string;
}

export type NotificationTemplateType = 'gaming' | 'system' | 'achievement' | 'neutral' | 'custom';

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
  notification_template?: NotificationTemplateType;
  custom_notification_text?: string;
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
  pinnedAt?: string | null;
  mutedAt?: string | null;
  disappearAfterSeconds?: number | null;
  burn_ttl_seconds?: number | null;
  is_group?: boolean;
  group_name?: string | null;
  group_avatar_url?: string | null;
  group_description?: string | null;
  member_count?: number;
  group_members?: UserProfile[];
  member_ids?: string[];
  created_by?: string;
  my_role?: 'owner' | 'admin' | 'member';
}

export interface GroupMember {
  user_id: string;
  conversation_id: string;
  role: 'owner' | 'admin' | 'member';
  nickname?: string | null;
  last_read_at?: string | null;
  profile: UserProfile;
}

export interface MessageItem {
  id: string;
  conversation_id: string;
  sender_id: string;
  content: string;
  is_read: boolean;
  created_at: string;
  sender?: UserProfile;
  /** Id generated on the device, so a retried send is stored once. */
  client_id?: string | null;
  reply_to_id?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  /** Set when the chat has disappearing messages on. */
  expires_at?: string | null;
  /** Set when the media is one-time ephemeral view. Kept for back-compat; view_mode is authoritative. */
  is_view_once?: boolean;
  /** Timestamp the recipient first claimed/opened the ephemeral media. */
  view_once_opened_at?: string | null;
  /** Ephemeral media retention mode. Defaults to 'keep_in_chat' server-side. */
  view_mode?: 'view_once' | 'allow_replay' | 'keep_in_chat';
  /** Server-authoritative count of successful claims (max 1 for view_once, 2 for allow_replay). */
  view_count?: number;
  /** Local only: not yet confirmed by the server. */
  status?: 'sending' | 'queued' | 'failed';
}

export type ReactionEmoji = '❤️' | '😂' | '👍' | '😮' | '😢' | '🔥';
export const REACTION_EMOJIS: ReactionEmoji[] = ['❤️', '😂', '👍', '😮', '😢', '🔥'];

export interface MessageReaction {
  user_id: string;
  emoji: ReactionEmoji;
}

export interface GalleryItem {
  id: string;
  user_id: string;
  image_url: string;
  storage_path: string;
  caption: string | null;
  created_at: string;
  media_type?: string | null;
  is_favorite?: boolean;
  deleted_at?: string | null;
  album_id?: string | null;
}

export interface GalleryAlbum {
  id: string;
  user_id: string;
  title: string;
  cover_item_id: string | null;
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

export type SocialTab = 'chats' | 'camera' | 'gallery' | 'profile' | 'messages' | 'home' | 'connections' | 'settings';
export type AdminTab = 'dashboard' | 'users' | 'messages' | 'gallery' | 'audit_log';

export type NotificationMode = 'default' | 'custom' | 'silent';

export interface ContactNotificationPreference {
  id?: string;
  owner_id: string;
  contact_id: string;
  notification_mode: NotificationMode;
  custom_phrase: string | null;
  custom_sound: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface PushSubscriptionItem {
  id?: string;
  user_id: string;
  fcm_token: string;
  device_info?: string;
  created_at?: string;
  updated_at?: string;
}
