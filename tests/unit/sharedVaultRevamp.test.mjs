import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// 1. Verify schema migration exists and includes albums table and group chat RLS
const migrationPath = path.join(repo, 'supabase/migrations/20260927000008_shared_vault_revamp.sql');
assert.ok(fs.existsSync(migrationPath), 'Migration 20260927000008_shared_vault_revamp.sql must exist');
const migrationSql = fs.readFileSync(migrationPath, 'utf8');
assert.ok(migrationSql.includes('CREATE TABLE IF NOT EXISTS public.shared_vault_albums'), 'Must create shared_vault_albums table');
assert.ok(migrationSql.includes('conversation_members cm'), 'RLS policy must support group chat memberships');
assert.ok(migrationSql.includes('ADD COLUMN IF NOT EXISTS album_id'), 'Must add album_id column to shared_vault_items');
assert.ok(migrationSql.includes('ADD COLUMN IF NOT EXISTS deleted_at'), 'Must add deleted_at column for soft delete');

// 2. Verify TypeScript types
const typesContent = fs.readFileSync(path.join(repo, 'src/types/index.ts'), 'utf8');
assert.ok(typesContent.includes('export interface SharedVaultAlbum'), 'Must declare SharedVaultAlbum interface');
assert.ok(typesContent.includes('album_id?: string | null;'), 'SharedVaultItem must include album_id');
assert.ok(typesContent.includes('deleted_at?: string | null;'), 'SharedVaultItem must include deleted_at');
assert.ok(typesContent.includes('VaultNavigationState'), 'Must declare VaultNavigationState');

// 3. Verify API methods in sharedVaultApi.ts
const apiContent = fs.readFileSync(path.join(repo, 'src/lib/sharedVaultApi.ts'), 'utf8');
assert.ok(apiContent.includes('export async function listSharedVaultAlbums'), 'Must export listSharedVaultAlbums');
assert.ok(apiContent.includes('export async function createSharedVaultAlbum'), 'Must export createSharedVaultAlbum');
assert.ok(apiContent.includes('export async function updateSharedVaultAlbum'), 'Must export updateSharedVaultAlbum');
assert.ok(apiContent.includes('export async function deleteSharedVaultAlbum'), 'Must export deleteSharedVaultAlbum');
assert.ok(apiContent.includes('export async function moveItemsToAlbum'), 'Must export moveItemsToAlbum');
assert.ok(apiContent.includes('export async function softDeleteSharedVaultItem'), 'Must export softDeleteSharedVaultItem');
assert.ok(apiContent.includes('export async function restoreSharedVaultItem'), 'Must export restoreSharedVaultItem');
assert.ok(apiContent.includes('getCachedSignedUrl'), 'Must include signed URL cache manager');

// 4. Verify Components
const inspectorContent = fs.readFileSync(path.join(repo, 'src/components/messages/SharedVaultInspectorSheet.tsx'), 'utf8');
assert.ok(inspectorContent.includes('SharedVaultInspectorSheet'), 'Must export SharedVaultInspectorSheet');
assert.ok(inspectorContent.includes('handleDelete'), 'Must support item deletion');
assert.ok(inspectorContent.includes('handleMoveToAlbum'), 'Must support moving to album');

const albumViewContent = fs.readFileSync(path.join(repo, 'src/components/messages/SharedVaultAlbumView.tsx'), 'utf8');
assert.ok(albumViewContent.includes('SharedVaultAlbumView'), 'Must export SharedVaultAlbumView');

const vaultViewContent = fs.readFileSync(path.join(repo, 'src/components/messages/SharedVaultView.tsx'), 'utf8');
assert.ok(vaultViewContent.includes('SharedVaultInspectorSheet'), 'SharedVaultView must connect inspector sheet');
assert.ok(vaultViewContent.includes('SharedVaultAlbumView'), 'SharedVaultView must connect album sub-page');
assert.ok(vaultViewContent.includes('useBackHandler'), 'SharedVaultView must handle hardware back button navigation');

console.log('Shared Vault revamp unit tests passed successfully');
