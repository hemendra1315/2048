import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Unit Test Suite for Zero-Trust Group Chat System:
 * - Group creation and member membership roles (owner, admin, member)
 * - Instagram-style nickname resolution hierarchy: nickname -> display_name -> username
 * - Admin authorization checks on updating group metadata, adding/removing members
 * - Transfer of ownership upon owner exit
 * - Cascading deletion of group chats, messages, and membership bindings
 */

// Simulated In-Memory Group Chat Engine mimicking PostgreSQL RPCs in 20260927000007_group_chat_and_nicknames.sql
class InMemoryGroupChatEngine {
  constructor() {
    this.profiles = new Map();
    this.conversations = new Map();
    this.conversationMembers = new Map(); // key: `${convId}_${userId}`
    this.messages = [];
    this.sharedVaultItems = [];
  }

  seedProfile(profile) {
    this.profiles.set(profile.id, profile);
  }

  // RPC: create_group_chat
  createGroupChat(creatorId, name, memberIds, avatarUrl = null, description = null) {
    if (!name || !name.trim()) throw new Error('Group name cannot be empty');
    if (!this.profiles.has(creatorId)) throw new Error('Creator profile does not exist');

    const convId = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const conv = {
      id: convId,
      is_group: true,
      name: name.trim(),
      group_avatar_url: avatarUrl,
      description: description ? description.trim() : null,
      created_by: creatorId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.conversations.set(convId, conv);

    // Add creator as 'owner'
    this.conversationMembers.set(`${convId}_${creatorId}`, {
      conversation_id: convId,
      user_id: creatorId,
      role: 'owner',
      nickname: null,
      joined_at: new Date().toISOString(),
    });

    // Add remaining unique members as 'member'
    const uniqueMembers = Array.from(new Set(memberIds)).filter(id => id !== creatorId);
    for (const uid of uniqueMembers) {
      if (this.profiles.has(uid)) {
        this.conversationMembers.set(`${convId}_${uid}`, {
          conversation_id: convId,
          user_id: uid,
          role: 'member',
          nickname: null,
          joined_at: new Date().toISOString(),
        });
      }
    }

    return convId;
  }

  // RPC: update_group_info
  updateGroupInfo(callerId, convId, { name, avatarUrl, description }) {
    const membership = this.conversationMembers.get(`${convId}_${callerId}`);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      throw new Error('Only group owners and admins can edit group details');
    }
    const conv = this.conversations.get(convId);
    if (!conv) throw new Error('Conversation not found');

    if (name !== undefined && name !== null) conv.name = name.trim();
    if (avatarUrl !== undefined) conv.group_avatar_url = avatarUrl;
    if (description !== undefined) conv.description = description ? description.trim() : null;
    conv.updated_at = new Date().toISOString();
  }

  // RPC: set_member_nickname (Instagram-style nickname)
  setMemberNickname(callerId, convId, targetUserId, nickname) {
    const callerMem = this.conversationMembers.get(`${convId}_${callerId}`);
    if (!callerMem) throw new Error('Caller is not a member of this group');

    const targetMem = this.conversationMembers.get(`${convId}_${targetUserId}`);
    if (!targetMem) throw new Error('Target user is not a member of this conversation');

    targetMem.nickname = nickname ? nickname.trim() : null;
  }

  // Resolve display name following the priority: nickname -> display_name -> username
  resolveDisplayName(convId, userId) {
    const mem = this.conversationMembers.get(`${convId}_${userId}`);
    const prof = this.profiles.get(userId);
    if (!prof) return 'Unknown User';

    if (mem && mem.nickname) {
      return mem.nickname;
    }
    if (prof.display_name && prof.display_name.trim()) {
      return prof.display_name;
    }
    return prof.username || prof.uid || 'User';
  }

  // RPC: add_group_members
  addGroupMembers(callerId, convId, userIds) {
    const callerMem = this.conversationMembers.get(`${convId}_${callerId}`);
    if (!callerMem || (callerMem.role !== 'owner' && callerMem.role !== 'admin')) {
      throw new Error('Only admins or owners can add group members');
    }

    for (const uid of userIds) {
      const key = `${convId}_${uid}`;
      if (!this.conversationMembers.has(key) && this.profiles.has(uid)) {
        this.conversationMembers.set(key, {
          conversation_id: convId,
          user_id: uid,
          role: 'member',
          nickname: null,
          joined_at: new Date().toISOString(),
        });
      }
    }
  }

  // RPC: remove_group_member
  removeGroupMember(callerId, convId, targetUserId) {
    const callerMem = this.conversationMembers.get(`${convId}_${callerId}`);
    if (!callerMem) throw new Error('Caller is not a member');

    const targetMem = this.conversationMembers.get(`${convId}_${targetUserId}`);
    if (!targetMem) throw new Error('Target user not in group');

    if (callerId !== targetUserId) {
      if (callerMem.role !== 'owner' && callerMem.role !== 'admin') {
        throw new Error('Permission denied: cannot remove members');
      }
      if (targetMem.role === 'owner') {
        throw new Error('Permission denied: cannot remove the group owner');
      }
      if (callerMem.role === 'admin' && targetMem.role === 'admin') {
        throw new Error('Admins cannot remove other admins');
      }
    }

    this.conversationMembers.delete(`${convId}_${targetUserId}`);
  }

  // RPC: set_group_member_role
  setGroupMemberRole(callerId, convId, targetUserId, newRole) {
    const callerMem = this.conversationMembers.get(`${convId}_${callerId}`);
    if (!callerMem || callerMem.role !== 'owner') {
      throw new Error('Only the group owner can manage roles');
    }

    const targetMem = this.conversationMembers.get(`${convId}_${targetUserId}`);
    if (!targetMem) throw new Error('Target user not found');
    if (callerId === targetUserId) throw new Error('Owner cannot change own role here');

    if (newRole !== 'admin' && newRole !== 'member') {
      throw new Error('Invalid role');
    }

    targetMem.role = newRole;
  }

  // RPC: leave_group_chat
  leaveGroupChat(callerId, convId) {
    const callerMem = this.conversationMembers.get(`${convId}_${callerId}`);
    if (!callerMem) throw new Error('Not a member');

    if (callerMem.role === 'owner') {
      // Find successor admin or oldest member
      const otherMembers = Array.from(this.conversationMembers.values()).filter(
        m => m.conversation_id === convId && m.user_id !== callerId
      );

      if (otherMembers.length > 0) {
        const nextAdmin = otherMembers.find(m => m.role === 'admin') || otherMembers[0];
        nextAdmin.role = 'owner';
      } else {
        // No members left -> delete conversation
        this.deleteGroupChat(callerId, convId, true);
        return;
      }
    }

    this.conversationMembers.delete(`${convId}_${callerId}`);
  }

  // RPC: delete_group_chat
  deleteGroupChat(callerId, convId, systemOverride = false) {
    if (!systemOverride) {
      const callerMem = this.conversationMembers.get(`${convId}_${callerId}`);
      if (!callerMem || (callerMem.role !== 'owner' && callerMem.role !== 'admin')) {
        throw new Error('Only group owners or admins can delete this group');
      }
    }

    // Cascade delete members
    for (const [key, mem] of this.conversationMembers.entries()) {
      if (mem.conversation_id === convId) {
        this.conversationMembers.delete(key);
      }
    }

    // Cascade delete messages
    this.messages = this.messages.filter(m => m.conversation_id !== convId);

    // Cascade delete shared vault items
    this.sharedVaultItems = this.sharedVaultItems.filter(v => v.conversation_id !== convId);

    // Delete conversation
    this.conversations.delete(convId);
  }

  getMembers(convId) {
    return Array.from(this.conversationMembers.values())
      .filter(m => m.conversation_id === convId)
      .map(m => ({
        ...m,
        profile: this.profiles.get(m.user_id),
      }));
  }
}

test('Group Chat: Creation assigns owner and members correctly', () => {
  const engine = new InMemoryGroupChatEngine();
  engine.seedProfile({ id: 'u1', username: 'alice', display_name: 'Alice W.', uid: 'ALICE-1' });
  engine.seedProfile({ id: 'u2', username: 'bob', display_name: 'Bob M.', uid: 'BOB-2' });
  engine.seedProfile({ id: 'u3', username: 'carol', display_name: 'Carol D.', uid: 'CAROL-3' });

  const convId = engine.createGroupChat('u1', 'Design Guild', ['u2', 'u3'], 'https://cdn/guild.jpg', 'Top secret team');
  const members = engine.getMembers(convId);

  assert.equal(members.length, 3);
  const owner = members.find(m => m.user_id === 'u1');
  const bob = members.find(m => m.user_id === 'u2');
  const carol = members.find(m => m.user_id === 'u3');

  assert.equal(owner.role, 'owner');
  assert.equal(bob.role, 'member');
  assert.equal(carol.role, 'member');
  assert.equal(engine.conversations.get(convId).name, 'Design Guild');
  assert.equal(engine.conversations.get(convId).group_avatar_url, 'https://cdn/guild.jpg');
});

test('Group Chat: Instagram-style Nicknames resolution hierarchy', () => {
  const engine = new InMemoryGroupChatEngine();
  engine.seedProfile({ id: 'u1', username: 'alice_007', display_name: 'Alice Walker', uid: 'ALICE' });
  engine.seedProfile({ id: 'u2', username: 'bob_the_builder', display_name: 'Robert Vance', uid: 'BOB' });

  const convId = engine.createGroupChat('u1', 'Secret Squad', ['u2']);

  // Before nickname is set: resolves to display_name
  assert.equal(engine.resolveDisplayName(convId, 'u2'), 'Robert Vance');

  // Set custom Instagram nickname for Bob in this conversation
  engine.setMemberNickname('u1', convId, 'u2', 'Bobby Bear 🐻');
  assert.equal(engine.resolveDisplayName(convId, 'u2'), 'Bobby Bear 🐻');

  // Verify global profile display_name was NOT altered
  assert.equal(engine.profiles.get('u2').display_name, 'Robert Vance');

  // Clear nickname -> falls back to display_name
  engine.setMemberNickname('u2', convId, 'u2', null);
  assert.equal(engine.resolveDisplayName(convId, 'u2'), 'Robert Vance');

  // If display_name is empty -> falls back to username
  engine.profiles.get('u2').display_name = '';
  assert.equal(engine.resolveDisplayName(convId, 'u2'), 'bob_the_builder');
});

test('Group Chat: Admin authorization boundaries & role management', () => {
  const engine = new InMemoryGroupChatEngine();
  engine.seedProfile({ id: 'u1', username: 'alice', display_name: 'Alice', uid: 'U1' });
  engine.seedProfile({ id: 'u2', username: 'bob', display_name: 'Bob', uid: 'U2' });
  engine.seedProfile({ id: 'u3', username: 'charlie', display_name: 'Charlie', uid: 'U3' });
  engine.seedProfile({ id: 'u4', username: 'david', display_name: 'David', uid: 'U4' });

  const convId = engine.createGroupChat('u1', 'Dev Guild', ['u2', 'u3', 'u4']);

  // Standard member cannot promote someone to admin
  assert.throws(() => {
    engine.setGroupMemberRole('u2', convId, 'u3', 'admin');
  }, /Only the group owner/);

  // Owner promotes Bob to admin
  engine.setGroupMemberRole('u1', convId, 'u2', 'admin');
  const bobMem = engine.conversationMembers.get(`${convId}_u2`);
  assert.equal(bobMem.role, 'admin');

  // Admin (Bob) can kick standard member (Charlie)
  engine.removeGroupMember('u2', convId, 'u3');
  assert.equal(engine.conversationMembers.has(`${convId}_u3`), false);

  // Admin cannot kick the Owner
  assert.throws(() => {
    engine.removeGroupMember('u2', convId, 'u1');
  }, /cannot remove the group owner/);

  // Standard member cannot kick anyone
  assert.throws(() => {
    engine.removeGroupMember('u4', convId, 'u2');
  }, /Permission denied/);
});

test('Group Chat: Owner leaving transfers leadership to next admin or member', () => {
  const engine = new InMemoryGroupChatEngine();
  engine.seedProfile({ id: 'u1', username: 'owner_alice', display_name: 'Alice', uid: 'U1' });
  engine.seedProfile({ id: 'u2', username: 'admin_bob', display_name: 'Bob', uid: 'U2' });
  engine.seedProfile({ id: 'u3', username: 'member_carol', display_name: 'Carol', uid: 'U3' });

  const convId = engine.createGroupChat('u1', 'Alpha Team', ['u2', 'u3']);
  engine.setGroupMemberRole('u1', convId, 'u2', 'admin');

  // Alice (owner) leaves
  engine.leaveGroupChat('u1', convId);

  // Bob (admin) should automatically become the new owner
  const bobMem = engine.conversationMembers.get(`${convId}_u2`);
  assert.equal(bobMem.role, 'owner');
  assert.equal(engine.conversationMembers.has(`${convId}_u1`), false);
});

test('Group Chat: Permanent deletion cascades cleanup to all tables', () => {
  const engine = new InMemoryGroupChatEngine();
  engine.seedProfile({ id: 'u1', username: 'alice', display_name: 'Alice', uid: 'U1' });
  engine.seedProfile({ id: 'u2', username: 'bob', display_name: 'Bob', uid: 'U2' });

  const convId = engine.createGroupChat('u1', 'Ephemeral Squad', ['u2']);

  // Add dummy message and vault item
  engine.messages.push({ id: 'm1', conversation_id: convId, content: 'Hey team' });
  engine.sharedVaultItems.push({ id: 'v1', conversation_id: convId, type: 'photo' });

  // Standard member cannot delete group
  assert.throws(() => {
    engine.deleteGroupChat('u2', convId);
  }, /Only group owners or admins can delete/);

  // Owner deletes group permanently
  engine.deleteGroupChat('u1', convId);

  // Verify full cascade
  assert.equal(engine.conversations.has(convId), false);
  assert.equal(engine.conversationMembers.has(`${convId}_u1`), false);
  assert.equal(engine.conversationMembers.has(`${convId}_u2`), false);
  assert.equal(engine.messages.length, 0);
  assert.equal(engine.sharedVaultItems.length, 0);
});
