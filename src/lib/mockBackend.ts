import {
  UserProfile,
  UserPreferences,
  ConnectionRequestItem,
  ConnectionItem,
  ConversationItem,
  MessageItem,
  GalleryItem,
  AdminAccessLogItem,
  CoverGameType,
} from '../types';
import { hashSecret } from './utils';

// LocalStorage Keys
const KEYS = {
  CURRENT_USER: 'vault_mock_current_user',
  PROFILES: 'vault_mock_profiles',
  USER_PREFS: 'vault_mock_user_prefs',
  GAME_PROGRESS: 'vault_mock_game_progress',
  REQUESTS: 'vault_mock_requests',
  CONNECTIONS: 'vault_mock_connections',
  BLOCKS: 'vault_mock_blocks',
  CONVERSATIONS: 'vault_mock_conversations',
  MESSAGES: 'vault_mock_messages',
  GALLERY: 'vault_mock_gallery',
  AUDIT_LOGS: 'vault_mock_audit_logs',
};

// Initial Demo Profiles
const INITIAL_PROFILES: UserProfile[] = [
  {
    id: 'usr_admin_001',
    uid: 'TITAN-9000',
    display_name: 'Overwatch (Admin)',
    avatar_url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    role: 'super_admin',
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 30).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'usr_demo_002',
    uid: 'CIPHER-4921',
    display_name: 'Alex Mercer',
    avatar_url: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    role: 'user',
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 14).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'usr_friend_003',
    uid: 'SOLAR-8120',
    display_name: 'Elena Rostova',
    avatar_url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    role: 'user',
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'usr_friend_004',
    uid: 'VORTEX-3391',
    display_name: 'Marcus Vance',
    avatar_url: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
    role: 'user',
    status: 'active',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    updated_at: new Date().toISOString(),
  }
];

class MockBackendService {
  private listeners: Map<string, Set<(data: unknown) => void>> = new Map();

  constructor() {
    this.seedDefaultsIfEmpty();
  }

  private async seedDefaultsIfEmpty() {
    if (!localStorage.getItem(KEYS.PROFILES)) {
      localStorage.setItem(KEYS.PROFILES, JSON.stringify(INITIAL_PROFILES));
    }

    const defaultSecretHash = await hashSecret('2048');

    if (!localStorage.getItem(KEYS.USER_PREFS)) {
      const prefs: Record<string, UserPreferences> = {};
      for (const p of INITIAL_PROFILES) {
        prefs[p.id] = {
          id: `pref_${p.id}`,
          user_id: p.id,
          custom_app_name: 'Retro Arcade',
          selected_icon: 'arcade_gamepad',
          selected_game: 'game_2048',
          unlock_method: 'pin',
          unlock_secret_hash: defaultSecretHash,
          theme_preference: 'dark_modern',
          auto_lock_seconds: 60,
        };
      }
      localStorage.setItem(KEYS.USER_PREFS, JSON.stringify(prefs));
    }

    if (!localStorage.getItem(KEYS.CONNECTIONS)) {
      // Connect Alex (002) with Elena (003)
      const initialConns: ConnectionItem[] = [
        {
          id: 'conn_001',
          user_a: 'usr_demo_002',
          user_b: 'usr_friend_003',
          created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
          partner: INITIAL_PROFILES[2],
        }
      ];
      localStorage.setItem(KEYS.CONNECTIONS, JSON.stringify(initialConns));
    }

    if (!localStorage.getItem(KEYS.CONVERSATIONS)) {
      const initialConvs = [
        {
          id: 'conv_001',
          user_a: 'usr_demo_002',
          user_b: 'usr_friend_003',
          created_at: new Date(Date.now() - 86400000 * 3).toISOString(),
          updated_at: new Date(Date.now() - 3600000).toISOString(),
        }
      ];
      localStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(initialConvs));
    }

    if (!localStorage.getItem(KEYS.MESSAGES)) {
      const initialMsgs: MessageItem[] = [
        {
          id: 'msg_001',
          conversation_id: 'conv_001',
          sender_id: 'usr_friend_003',
          content: 'Hey Alex! Glad you unlocked the channel. The game disguise works like a charm.',
          is_read: true,
          created_at: new Date(Date.now() - 7200000).toISOString(),
        },
        {
          id: 'msg_002',
          conversation_id: 'conv_001',
          sender_id: 'usr_demo_002',
          content: 'Totally! What score did you get on Snake before unlocking?',
          is_read: true,
          created_at: new Date(Date.now() - 5400000).toISOString(),
        },
        {
          id: 'msg_003',
          conversation_id: 'conv_001',
          sender_id: 'usr_friend_003',
          content: 'Hit 420! Check out the photo I stored in my private gallery.',
          is_read: false,
          created_at: new Date(Date.now() - 1800000).toISOString(),
        }
      ];
      localStorage.setItem(KEYS.MESSAGES, JSON.stringify(initialMsgs));
    }

    if (!localStorage.getItem(KEYS.GALLERY)) {
      const initialGallery: GalleryItem[] = [
        {
          id: 'gal_001',
          user_id: 'usr_demo_002',
          image_url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=800&auto=format&fit=crop&q=80',
          storage_path: 'usr_demo_002/cyber_circuit.jpg',
          caption: 'Neon Circuitry Matrix',
          created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
        },
        {
          id: 'gal_002',
          user_id: 'usr_demo_002',
          image_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=800&auto=format&fit=crop&q=80',
          storage_path: 'usr_demo_002/retro_console.jpg',
          caption: 'Vintage Hardware Setup',
          created_at: new Date(Date.now() - 86400000 * 1).toISOString(),
        }
      ];
      localStorage.setItem(KEYS.GALLERY, JSON.stringify(initialGallery));
    }

    if (!localStorage.getItem(KEYS.AUDIT_LOGS)) {
      const initialLogs: AdminAccessLogItem[] = [
        {
          id: 'log_001',
          admin_id: 'usr_admin_001',
          action_type: 'SYSTEM_INITIALIZED',
          target_user_id: null,
          target_resource_id: 'system_core',
          metadata: { note: 'Platform security policies verified' },
          ip_address: '127.0.0.1',
          user_agent: 'Antigravity Platform Engine',
          created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
        }
      ];
      localStorage.setItem(KEYS.AUDIT_LOGS, JSON.stringify(initialLogs));
    }
  }

  // Subscriptions & Realtime Events
  subscribe(channel: string, callback: (data: unknown) => void) {
    if (!this.listeners.has(channel)) {
      this.listeners.set(channel, new Set());
    }
    this.listeners.get(channel)!.add(callback);
    return () => {
      this.listeners.get(channel)?.delete(callback);
    };
  }

  emit(channel: string, data: unknown) {
    const channelListeners = this.listeners.get(channel);
    if (channelListeners) {
      channelListeners.forEach(cb => cb(data));
    }
  }

  // AUTHENTICATION
  getCurrentUser(): UserProfile | null {
    const saved = localStorage.getItem(KEYS.CURRENT_USER);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    // Default to demo user
    const profiles = this.getProfiles();
    const demoUser = profiles.find(p => p.id === 'usr_demo_002') || profiles[0];
    localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(demoUser));
    return demoUser;
  }

  setCurrentUser(user: UserProfile | null) {
    if (user) {
      localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(KEYS.CURRENT_USER);
    }
    this.emit('auth:state_change', user);
  }

  async login(email: string): Promise<UserProfile> {
    const profiles = this.getProfiles();
    const cleanEmail = email.toLowerCase().trim();

    let user: UserProfile | undefined;
    if (cleanEmail.includes('admin')) {
      user = profiles.find(p => p.role === 'super_admin');
    } else if (cleanEmail.includes('elena')) {
      user = profiles.find(p => p.id === 'usr_friend_003');
    } else if (cleanEmail.includes('marcus')) {
      user = profiles.find(p => p.id === 'usr_friend_004');
    } else {
      user = profiles.find(p => p.id === 'usr_demo_002');
    }

    if (!user) {
      user = profiles[0];
    }

    if (user.status === 'banned') {
      throw new Error('This account has been permanently suspended by administration.');
    }
    if (user.status === 'suspended') {
      throw new Error('This account is temporarily suspended.');
    }

    this.setCurrentUser(user);
    return user;
  }

  async register(displayName: string): Promise<UserProfile> {
    const profiles = this.getProfiles();
    const newUid = this.generateUID();
    const newUserId = `usr_${Date.now()}`;

    const newUser: UserProfile = {
      id: newUserId,
      uid: newUid,
      display_name: displayName.trim(),
      avatar_url: `https://api.dicebear.com/7.x/bottts/svg?seed=${newUid}`,
      role: 'user',
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    profiles.push(newUser);
    localStorage.setItem(KEYS.PROFILES, JSON.stringify(profiles));

    // Initialize Preferences with hashed secret
    const prefsMap = this.getAllUserPrefs();
    const defaultSecretHash = await hashSecret('2048');
    prefsMap[newUserId] = {
      id: `pref_${newUserId}`,
      user_id: newUserId,
      custom_app_name: 'Retro Arcade',
      selected_icon: 'arcade_gamepad',
      selected_game: 'game_2048',
      unlock_method: 'pin',
      unlock_secret_hash: defaultSecretHash,
      theme_preference: 'dark_modern',
      auto_lock_seconds: 60,
    };
    localStorage.setItem(KEYS.USER_PREFS, JSON.stringify(prefsMap));

    this.setCurrentUser(newUser);
    return newUser;
  }

  // PROFILES & UID LOOKUP
  getProfiles(): UserProfile[] {
    const raw = localStorage.getItem(KEYS.PROFILES);
    return raw ? JSON.parse(raw) : INITIAL_PROFILES;
  }

  getProfileById(userId: string): UserProfile | null {
    return this.getProfiles().find(p => p.id === userId) || null;
  }

  lookupProfileByUid(uid: string): UserProfile | null {
    const currentUser = this.getCurrentUser();
    const cleanUid = uid.toUpperCase().trim();
    const profiles = this.getProfiles();

    const target = profiles.find(p => p.uid === cleanUid && p.status === 'active');
    if (!target) return null;
    if (currentUser && target.id === currentUser.id) return null;

    // Check if blocked
    if (currentUser && this.isBlocked(currentUser.id, target.id)) {
      return null;
    }

    return target;
  }

  updateProfile(userId: string, updates: Partial<UserProfile>): UserProfile {
    const profiles = this.getProfiles();
    const index = profiles.findIndex(p => p.id === userId);
    if (index === -1) throw new Error('User not found');

    const updated = { ...profiles[index], ...updates, updated_at: new Date().toISOString() };
    profiles[index] = updated;
    localStorage.setItem(KEYS.PROFILES, JSON.stringify(profiles));

    const current = this.getCurrentUser();
    if (current && current.id === userId) {
      this.setCurrentUser(updated);
    }

    return updated;
  }

  // USER PREFERENCES & UNLOCK SECRETS (HASHED)
  getAllUserPrefs(): Record<string, UserPreferences> {
    const raw = localStorage.getItem(KEYS.USER_PREFS);
    return raw ? JSON.parse(raw) : {};
  }

  getUserPreferences(userId: string): UserPreferences {
    const prefsMap = this.getAllUserPrefs();
    if (prefsMap[userId]) return prefsMap[userId];

    // Fallback default
    return {
      id: `pref_${userId}`,
      user_id: userId,
      custom_app_name: 'Retro Arcade',
      selected_icon: 'arcade_gamepad',
      selected_game: 'game_2048',
      unlock_method: 'pin',
      unlock_secret_hash: '',
      theme_preference: 'dark_modern',
      auto_lock_seconds: 60,
    };
  }

  async verifyUnlockSecret(userId: string, secret: string): Promise<boolean> {
    const prefs = this.getUserPreferences(userId);
    const inputHash = await hashSecret(secret);
    return prefs.unlock_secret_hash === inputHash;
  }

  async updateUnlockSecret(userId: string, oldSecret: string, newSecret: string): Promise<boolean> {
    const prefsMap = this.getAllUserPrefs();
    const prefs = this.getUserPreferences(userId);

    const oldHash = await hashSecret(oldSecret);
    if (prefs.unlock_secret_hash && prefs.unlock_secret_hash !== oldHash) {
      throw new Error('Current PIN / Secret is incorrect');
    }

    const newHash = await hashSecret(newSecret);
    prefsMap[userId] = {
      ...prefs,
      unlock_secret_hash: newHash,
    };
    localStorage.setItem(KEYS.USER_PREFS, JSON.stringify(prefsMap));
    return true;
  }

  updateUserPreferences(userId: string, updates: Partial<UserPreferences>): UserPreferences {
    const prefsMap = this.getAllUserPrefs();
    const current = this.getUserPreferences(userId);
    const updated = { ...current, ...updates };
    prefsMap[userId] = updated;
    localStorage.setItem(KEYS.USER_PREFS, JSON.stringify(prefsMap));
    this.emit('prefs:updated', updated);
    return updated;
  }

  // COVER GAMES & PROGRESS
  getGameProgress(userId: string, gameName: CoverGameType): { highScore: number; progressData: Record<string, unknown> } {
    const raw = localStorage.getItem(KEYS.GAME_PROGRESS);
    const map = raw ? JSON.parse(raw) : {};
    const key = `${userId}_${gameName}`;
    return map[key] || { highScore: 0, progressData: {} };
  }

  saveGameProgress(userId: string, gameName: CoverGameType, score: number, progressData: Record<string, unknown> = {}) {
    const raw = localStorage.getItem(KEYS.GAME_PROGRESS);
    const map = raw ? JSON.parse(raw) : {};
    const key = `${userId}_${gameName}`;

    const existing = map[key] || { highScore: 0, progressData: {} };
    const newHigh = Math.max(existing.highScore, score);

    map[key] = {
      highScore: newHigh,
      progressData: { ...existing.progressData, ...progressData },
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(KEYS.GAME_PROGRESS, JSON.stringify(map));
  }

  resetGameProgress(userId: string, gameName: CoverGameType) {
    const raw = localStorage.getItem(KEYS.GAME_PROGRESS);
    const map = raw ? JSON.parse(raw) : {};
    const key = `${userId}_${gameName}`;
    delete map[key];
    localStorage.setItem(KEYS.GAME_PROGRESS, JSON.stringify(map));
  }

  // CONNECTION REQUESTS & CONNECTIONS
  getConnectionRequests(userId: string): { incoming: ConnectionRequestItem[]; outgoing: ConnectionRequestItem[] } {
    const raw = localStorage.getItem(KEYS.REQUESTS);
    const allReqs: ConnectionRequestItem[] = raw ? JSON.parse(raw) : [];

    const incoming = allReqs
      .filter(r => r.receiver_id === userId && r.status === 'pending')
      .map(r => ({ ...r, sender: this.getProfileById(r.sender_id) || undefined }));

    const outgoing = allReqs
      .filter(r => r.sender_id === userId && r.status === 'pending')
      .map(r => ({ ...r, receiver: this.getProfileById(r.receiver_id) || undefined }));

    return { incoming, outgoing };
  }

  sendConnectionRequest(senderId: string, receiverId: string): ConnectionRequestItem {
    const raw = localStorage.getItem(KEYS.REQUESTS);
    const allReqs: ConnectionRequestItem[] = raw ? JSON.parse(raw) : [];

    if (this.isBlocked(senderId, receiverId)) {
      throw new Error('Unable to send request to this user.');
    }

    const existing = allReqs.find(
      r => (r.sender_id === senderId && r.receiver_id === receiverId) ||
           (r.sender_id === receiverId && r.receiver_id === senderId)
    );

    if (existing) {
      if (existing.status === 'pending') throw new Error('A connection request is already pending.');
      if (existing.status === 'accepted') throw new Error('You are already connected with this user.');
    }

    const newReq: ConnectionRequestItem = {
      id: `req_${Date.now()}`,
      sender_id: senderId,
      receiver_id: receiverId,
      status: 'pending',
      created_at: new Date().toISOString(),
      sender: this.getProfileById(senderId) || undefined,
      receiver: this.getProfileById(receiverId) || undefined,
    };

    allReqs.push(newReq);
    localStorage.setItem(KEYS.REQUESTS, JSON.stringify(allReqs));
    this.emit('requests:changed', newReq);
    return newReq;
  }

  respondToRequest(requestId: string, accept: boolean): boolean {
    const raw = localStorage.getItem(KEYS.REQUESTS);
    const allReqs: ConnectionRequestItem[] = raw ? JSON.parse(raw) : [];
    const reqIndex = allReqs.findIndex(r => r.id === requestId);
    if (reqIndex === -1) return false;

    const req = allReqs[reqIndex];
    req.status = accept ? 'accepted' : 'rejected';
    allReqs[reqIndex] = req;
    localStorage.setItem(KEYS.REQUESTS, JSON.stringify(allReqs));

    if (accept) {
      // 1. Create Bidirectional Connection with ordered pair
      const uA = req.sender_id < req.receiver_id ? req.sender_id : req.receiver_id;
      const uB = req.sender_id < req.receiver_id ? req.receiver_id : req.sender_id;

      const rawConns = localStorage.getItem(KEYS.CONNECTIONS);
      const connections: ConnectionItem[] = rawConns ? JSON.parse(rawConns) : [];

      if (!connections.some(c => c.user_a === uA && c.user_b === uB)) {
        connections.push({
          id: `conn_${Date.now()}`,
          user_a: uA,
          user_b: uB,
          created_at: new Date().toISOString(),
          partner: this.getProfileById(req.sender_id)!,
        });
        localStorage.setItem(KEYS.CONNECTIONS, JSON.stringify(connections));
      }

      // 2. Create 1-to-1 Conversation
      this.getOrCreateConversation(req.sender_id, req.receiver_id);
    }

    this.emit('requests:changed', req);
    this.emit('connections:changed', null);
    return true;
  }

  getConnections(userId: string): ConnectionItem[] {
    const rawConns = localStorage.getItem(KEYS.CONNECTIONS);
    const allConns: { id: string; user_a: string; user_b: string; created_at: string }[] = rawConns ? JSON.parse(rawConns) : [];

    return allConns
      .filter(c => c.user_a === userId || c.user_b === userId)
      .map(c => {
        const partnerId = c.user_a === userId ? c.user_b : c.user_a;
        return {
          id: c.id,
          user_a: c.user_a,
          user_b: c.user_b,
          created_at: c.created_at,
          partner: this.getProfileById(partnerId)!,
        };
      })
      .filter(c => Boolean(c.partner));
  }

  // USER BLOCKING
  blockUser(blockerId: string, blockedId: string) {
    const raw = localStorage.getItem(KEYS.BLOCKS);
    const blocks: { id: string; blocker_id: string; blocked_id: string; created_at: string }[] = raw ? JSON.parse(raw) : [];

    if (!blocks.some(b => b.blocker_id === blockerId && b.blocked_id === blockedId)) {
      blocks.push({
        id: `blk_${Date.now()}`,
        blocker_id: blockerId,
        blocked_id: blockedId,
        created_at: new Date().toISOString(),
      });
      localStorage.setItem(KEYS.BLOCKS, JSON.stringify(blocks));
    }
  }

  unblockUser(blockerId: string, blockedId: string) {
    const raw = localStorage.getItem(KEYS.BLOCKS);
    let blocks: { id: string; blocker_id: string; blocked_id: string }[] = raw ? JSON.parse(raw) : [];
    blocks = blocks.filter(b => !(b.blocker_id === blockerId && b.blocked_id === blockedId));
    localStorage.setItem(KEYS.BLOCKS, JSON.stringify(blocks));
  }

  isBlocked(userA: string, userB: string): boolean {
    const raw = localStorage.getItem(KEYS.BLOCKS);
    const blocks: { blocker_id: string; blocked_id: string }[] = raw ? JSON.parse(raw) : [];
    return blocks.some(
      b => (b.blocker_id === userA && b.blocked_id === userB) ||
           (b.blocker_id === userB && b.blocked_id === userA)
    );
  }

  // 1-TO-1 CONVERSATIONS & REALTIME MESSAGING
  getConversations(userId: string): ConversationItem[] {
    const rawConvs = localStorage.getItem(KEYS.CONVERSATIONS);
    const allConvs: { id: string; user_a: string; user_b: string; created_at: string; updated_at: string }[] = rawConvs ? JSON.parse(rawConvs) : [];

    const userConvs = allConvs.filter(c => c.user_a === userId || c.user_b === userId);

    const messages = this.getAllMessages();

    return userConvs.map(conv => {
      const partnerId = conv.user_a === userId ? conv.user_b : conv.user_a;
      const partner = this.getProfileById(partnerId)!;

      const convMessages = messages.filter(m => m.conversation_id === conv.id);
      const lastMessage = convMessages[convMessages.length - 1];
      const unreadCount = convMessages.filter(m => m.sender_id !== userId && !m.is_read).length;

      return {
        id: conv.id,
        user_a: conv.user_a,
        user_b: conv.user_b,
        created_at: conv.created_at,
        updated_at: conv.updated_at,
        partner,
        lastMessage,
        unreadCount,
      };
    }).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  }

  getOrCreateConversation(user1: string, user2: string): string {
    const uA = user1 < user2 ? user1 : user2;
    const uB = user1 < user2 ? user2 : user1;

    const rawConvs = localStorage.getItem(KEYS.CONVERSATIONS);
    const allConvs: { id: string; user_a: string; user_b: string; created_at: string; updated_at: string }[] = rawConvs ? JSON.parse(rawConvs) : [];

    const existing = allConvs.find(c => c.user_a === uA && c.user_b === uB);
    if (existing) return existing.id;

    const newId = `conv_${Date.now()}`;
    allConvs.push({
      id: newId,
      user_a: uA,
      user_b: uB,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    localStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(allConvs));
    return newId;
  }

  getAllMessages(): MessageItem[] {
    const raw = localStorage.getItem(KEYS.MESSAGES);
    return raw ? JSON.parse(raw) : [];
  }

  getMessages(conversationId: string): MessageItem[] {
    const msgs = this.getAllMessages().filter(m => m.conversation_id === conversationId);
    return msgs.map(m => ({ ...m, sender: this.getProfileById(m.sender_id) || undefined }));
  }

  sendMessage(conversationId: string, senderId: string, content: string): MessageItem {
    const allMsgs = this.getAllMessages();

    const newMsg: MessageItem = {
      id: `msg_${Date.now()}`,
      conversation_id: conversationId,
      sender_id: senderId,
      content: content.trim(),
      is_read: false,
      created_at: new Date().toISOString(),
      sender: this.getProfileById(senderId) || undefined,
    };

    allMsgs.push(newMsg);
    localStorage.setItem(KEYS.MESSAGES, JSON.stringify(allMsgs));

    // Update conversation timestamp
    const rawConvs = localStorage.getItem(KEYS.CONVERSATIONS);
    const allConvs = rawConvs ? JSON.parse(rawConvs) : [];
    const convIndex = allConvs.findIndex((c: { id: string }) => c.id === conversationId);
    if (convIndex !== -1) {
      allConvs[convIndex].updated_at = newMsg.created_at;
      localStorage.setItem(KEYS.CONVERSATIONS, JSON.stringify(allConvs));
    }

    this.emit(`chat:${conversationId}:new_message`, newMsg);
    this.emit('messages:updated', newMsg);
    return newMsg;
  }

  markMessagesAsRead(conversationId: string, currentUserId: string) {
    const allMsgs = this.getAllMessages();
    let changed = false;

    allMsgs.forEach(m => {
      if (m.conversation_id === conversationId && m.sender_id !== currentUserId && !m.is_read) {
        m.is_read = true;
        changed = true;
      }
    });

    if (changed) {
      localStorage.setItem(KEYS.MESSAGES, JSON.stringify(allMsgs));
      this.emit(`chat:${conversationId}:read`, { conversationId });
      this.emit('messages:updated', null);
    }
  }

  // PRIVATE GALLERY
  getGallery(userId: string): GalleryItem[] {
    const raw = localStorage.getItem(KEYS.GALLERY);
    const all: GalleryItem[] = raw ? JSON.parse(raw) : [];
    return all.filter(g => g.user_id === userId).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  uploadGalleryItem(userId: string, imageUrl: string, caption?: string): GalleryItem {
    const raw = localStorage.getItem(KEYS.GALLERY);
    const all: GalleryItem[] = raw ? JSON.parse(raw) : [];

    const newItem: GalleryItem = {
      id: `gal_${Date.now()}`,
      user_id: userId,
      image_url: imageUrl,
      storage_path: `${userId}/upload_${Date.now()}.jpg`,
      caption: caption || null,
      created_at: new Date().toISOString(),
    };

    all.unshift(newItem);
    localStorage.setItem(KEYS.GALLERY, JSON.stringify(all));
    this.emit('gallery:updated', newItem);
    return newItem;
  }

  deleteGalleryItem(itemId: string, userId: string, isAdmin = false): boolean {
    const raw = localStorage.getItem(KEYS.GALLERY);
    let all: GalleryItem[] = raw ? JSON.parse(raw) : [];

    const target = all.find(g => g.id === itemId);
    if (!target) return false;
    if (!isAdmin && target.user_id !== userId) return false;

    all = all.filter(g => g.id !== itemId);
    localStorage.setItem(KEYS.GALLERY, JSON.stringify(all));

    if (isAdmin) {
      this.logAdminAction(userId, 'DELETE_GALLERY_ITEM', target.user_id, itemId, {
        caption: target.caption,
      });
    }

    this.emit('gallery:updated', null);
    return true;
  }

  // SUPER ADMIN DASHBOARD & AUDIT LOGGING
  getAdminAuditLogs(): AdminAccessLogItem[] {
    const raw = localStorage.getItem(KEYS.AUDIT_LOGS);
    const logs: AdminAccessLogItem[] = raw ? JSON.parse(raw) : [];
    return logs.map(l => ({
      ...l,
      admin: l.admin_id ? this.getProfileById(l.admin_id) || undefined : undefined,
      targetUser: l.target_user_id ? this.getProfileById(l.target_user_id) || undefined : undefined,
    })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  logAdminAction(
    adminId: string,
    actionType: string,
    targetUserId: string | null = null,
    targetResourceId: string | null = null,
    metadata: Record<string, unknown> = {}
  ): AdminAccessLogItem {
    const raw = localStorage.getItem(KEYS.AUDIT_LOGS);
    const logs: AdminAccessLogItem[] = raw ? JSON.parse(raw) : [];

    const logEntry: AdminAccessLogItem = {
      id: `log_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      admin_id: adminId,
      action_type: actionType,
      target_user_id: targetUserId,
      target_resource_id: targetResourceId,
      metadata,
      ip_address: '127.0.0.1 (Local App)',
      user_agent: navigator.userAgent || 'App Mobile Client',
      created_at: new Date().toISOString(),
    };

    logs.unshift(logEntry);
    localStorage.setItem(KEYS.AUDIT_LOGS, JSON.stringify(logs));
    this.emit('admin:audit_log_added', logEntry);
    return logEntry;
  }

  adminSetUserStatus(adminId: string, targetUserId: string, status: 'active' | 'suspended' | 'banned', reason?: string): UserProfile {
    const profile = this.updateProfile(targetUserId, { status });

    const action = status === 'banned' ? 'BAN_USER' : status === 'suspended' ? 'SUSPEND_USER' : 'UNBAN_USER';
    this.logAdminAction(adminId, action, targetUserId, null, {
      previous_status: profile.status,
      new_status: status,
      reason: reason || 'Moderator policy enforcement',
    });

    return profile;
  }

  getAllGalleryItemsForAdmin(adminId: string): (GalleryItem & { user?: UserProfile })[] {
    const raw = localStorage.getItem(KEYS.GALLERY);
    const all: GalleryItem[] = raw ? JSON.parse(raw) : [];

    this.logAdminAction(adminId, 'VIEW_GALLERY', null, null, { count: all.length });

    return all.map(g => ({
      ...g,
      user: this.getProfileById(g.user_id) || undefined,
    }));
  }

  getAllConversationsForAdmin(adminId: string): (ConversationItem & { messages: MessageItem[] })[] {
    const rawConvs = localStorage.getItem(KEYS.CONVERSATIONS);
    const allConvs: { id: string; user_a: string; user_b: string; created_at: string; updated_at: string }[] = rawConvs ? JSON.parse(rawConvs) : [];
    const allMessages = this.getAllMessages();

    this.logAdminAction(adminId, 'VIEW_CONVERSATION', null, null, { total_conversations: allConvs.length });

    return allConvs.map(c => {
      const uB = this.getProfileById(c.user_b)!;
      const msgs = allMessages.filter(m => m.conversation_id === c.id);

      return {
        id: c.id,
        user_a: c.user_a,
        user_b: c.user_b,
        created_at: c.created_at,
        updated_at: c.updated_at,
        partner: uB,
        messages: msgs,
        unreadCount: 0,
      };
    });
  }

  private generateUID(): string {
    const words = [
      'CIPHER', 'SHADOW', 'NEXUS', 'SOLAR', 'PRISM', 'VORTEX', 'ECHO', 'AEON',
      'ORBIT', 'APEX', 'ZENITH', 'PULSE', 'TITAN', 'NOVA', 'LUMEN', 'SPECTER',
      'CYBER', 'ATLAS', 'HELIX', 'QUANTUM', 'PHOENIX', 'RADAR', 'KINETIC', 'BLAZE'
    ];
    const word = words[Math.floor(Math.random() * words.length)];
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${word}-${num}`;
  }
}

export const mockBackend = new MockBackendService();
