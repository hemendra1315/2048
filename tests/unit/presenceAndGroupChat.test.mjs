import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const tmpDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '.tmp_presence_test');
fs.mkdirSync(tmpDir, { recursive: true });

const presenceSrc = fs.readFileSync(path.join(repo, 'src/lib/presence.ts'), 'utf8')
  .replace("import { supabase, isSupabaseConfigured } from './supabase';", 'const supabase = (globalThis as any).__sb; const isSupabaseConfigured = () => false;')
  .replace("import { uniqueChannelName } from './realtime';", 'const uniqueChannelName = (s: string) => s;');

const targetPresence = path.join(tmpDir, 'presence.ts');
fs.writeFileSync(targetPresence, presenceSrc);

const presenceModule = await import(new URL('file://' + targetPresence.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '/$1')).href);
const { describePresence } = presenceModule;

// 1. Test describePresence with online presence
assert.equal(describePresence({ isOnline: true, lastSeenAt: null }), 'Active now');
assert.equal(describePresence({ isOnline: true, lastSeenAt: new Date().toISOString() }), 'Active now');

// 2. Test describePresence with recent offline presence (< 1 min)
const justNow = new Date(Date.now() - 20000).toISOString();
assert.equal(describePresence({ isOnline: false, lastSeenAt: justNow }), 'Active just now');

// 3. Test describePresence with minutes ago
const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
assert.equal(describePresence({ isOnline: false, lastSeenAt: fiveMinsAgo }), 'Active 5m ago');

// 4. Test describePresence with fallback timestamp when presence info is missing or offline without timestamp
const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
assert.equal(describePresence(undefined, tenMinsAgo), 'Active 10m ago');
assert.equal(describePresence({ isOnline: false, lastSeenAt: null }, tenMinsAgo), 'Active 10m ago');
assert.equal(describePresence(undefined, null), 'Active recently');

// 5. Test mockBackend group chat creation and listing
const mockStorage = new Map();
globalThis.localStorage = {
  getItem: (key) => mockStorage.get(key) ?? null,
  setItem: (key, val) => mockStorage.set(key, String(val)),
  removeItem: (key) => mockStorage.delete(key),
  clear: () => mockStorage.clear(),
};
globalThis.window = globalThis;

const utilsSrc = fs.readFileSync(path.join(repo, 'src/lib/utils.ts'), 'utf8');
fs.writeFileSync(path.join(tmpDir, 'utils.ts'), utilsSrc);

const mockBackendSrc = fs.readFileSync(path.join(repo, 'src/lib/mockBackend.ts'), 'utf8')
  .replace(/import\s*\{[\s\S]*?\}\s*from\s*['"]\.\.\/types['"];/, `
type UserProfile = any;
type UserPreferences = any;
type ConnectionRequestItem = any;
type ConnectionItem = any;
type ConversationItem = any;
type MessageItem = any;
type GalleryItem = any;
type AdminAccessLogItem = any;
type CoverGameType = any;
type ContactNotificationPreference = any;
`)
  .replace("from './utils'", "from './utils.ts'");

const targetMock = path.join(tmpDir, 'mockBackend.ts');
fs.writeFileSync(targetMock, mockBackendSrc);

const mockModule = await import(new URL('file://' + targetMock.replace(/\\/g, '/').replace(/^([A-Za-z]:)/, '/$1')).href);
const { mockBackend } = mockModule;

const group = mockBackend.createGroupConversation('usr_demo_002', 'Squad Vault', ['usr_friend_003', 'usr_priya_004']);
assert.equal(group.is_group, true);
assert.equal(group.group_name, 'Squad Vault');
assert.equal(group.partner.display_name, 'Squad Vault');
assert.equal(group.member_ids.length, 3);
assert.ok(group.member_ids.includes('usr_demo_002'));
assert.ok(group.member_ids.includes('usr_friend_003'));

// 6. Test getConversations for creator and member
const convsCreator = mockBackend.getConversations('usr_demo_002');
const foundGroupInCreator = convsCreator.find(c => c.id === group.id);
assert.ok(foundGroupInCreator);
assert.equal(foundGroupInCreator.is_group, true);
assert.equal(foundGroupInCreator.group_name, 'Squad Vault');

const convsMember = mockBackend.getConversations('usr_friend_003');
const foundGroupInMember = convsMember.find(c => c.id === group.id);
assert.ok(foundGroupInMember);
assert.equal(foundGroupInMember.is_group, true);

// 7. Test sending a message to group chat
const msg = mockBackend.sendMessage(group.id, 'usr_demo_002', 'Hey squad! Welcome to the group chat.');
assert.equal(msg.conversation_id, group.id);
assert.equal(msg.content, 'Hey squad! Welcome to the group chat.');

const groupMessages = mockBackend.getMessages(group.id);
assert.ok(groupMessages.some(m => m.content === 'Hey squad! Welcome to the group chat.'));

// Clean up tmp dir
try {
  fs.rmSync(tmpDir, { recursive: true, force: true });
} catch {
  // Ignore
}

console.log('presenceAndGroupChat unit tests passed');
