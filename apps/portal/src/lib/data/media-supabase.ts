import type { SupabaseClient } from '@supabase/supabase-js';

import type { AssetStatus, AssetTagLink, MediaTag, MediaUsage } from '@alsham/media';

import { DataPortError } from './port';
import type { MediaPort, AssetRowMedia } from './media-port';

const MEDIA = 'media';
const CORE = 'core';

function fail(what: string, cause: unknown): never {
  throw new DataPortError(`Não foi possível ${what}.`, { cause });
}

interface AssetDb {
  id: string;
  title: string;
  description: string;
  asset_type: string;
  location: string;
  status: AssetStatus;
  created_at: string;
}

interface UsageDb {
  id: string;
  seq: number;
  asset_id: string;
  used_in: string;
  note: string;
  reference_id: string | null;
  used_at: string;
}

export function createMediaSupabasePort(db: SupabaseClient, tenantId: string): MediaPort {
  return {
    kind: 'supabase',

    async listPermissions() {
      const { data, error } = await db
        .schema(CORE)
        .from('role_permissions')
        .select('permission_key')
        .like('permission_key', 'media.%');
      if (error) fail('carregar suas permissões', error);
      return new Set((data ?? []).map((r: { permission_key: string }) => r.permission_key));
    },

    async loadAssets() {
      const { data, error } = await db
        .schema(MEDIA)
        .from('assets')
        .select('id, title, description, asset_type, location, status, created_at')
        .eq('tenant_id', tenantId)
        .order('title');
      if (error) fail('carregar o acervo', error);
      return ((data ?? []) as AssetDb[]).map(
        (a): AssetRowMedia => ({
          id: a.id,
          title: a.title,
          description: a.description ?? '',
          assetType: a.asset_type ?? '',
          location: a.location,
          status: a.status,
          createdAt: a.created_at,
        }),
      );
    },

    async loadTags() {
      const { data, error } = await db
        .schema(MEDIA)
        .from('tags')
        .select('id, name')
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) fail('carregar as etiquetas', error);
      return (data ?? []) as MediaTag[];
    },

    async loadAssetTags() {
      const { data, error } = await db
        .schema(MEDIA)
        .from('asset_tags')
        .select('asset_id, tag_id')
        .eq('tenant_id', tenantId);
      if (error) fail('carregar as classificações', error);
      return ((data ?? []) as { asset_id: string; tag_id: string }[]).map(
        (l): AssetTagLink => ({ assetId: l.asset_id, tagId: l.tag_id }),
      );
    },

    async loadUsages() {
      const { data, error } = await db
        .schema(MEDIA)
        .from('usages')
        .select('id, seq, asset_id, used_in, note, reference_id, used_at')
        .eq('tenant_id', tenantId)
        .order('seq', { ascending: false });
      if (error) fail('carregar o livro de usos', error);
      return ((data ?? []) as UsageDb[]).map(
        (u): MediaUsage => ({
          id: u.id,
          seq: u.seq,
          assetId: u.asset_id,
          usedIn: u.used_in,
          note: u.note ?? '',
          referenceId: u.reference_id,
          usedAt: u.used_at,
        }),
      );
    },

    async createAsset(input) {
      const { data, error } = await db
        .schema(MEDIA)
        .from('assets')
        .insert({
          tenant_id: tenantId,
          title: input.title,
          description: input.description,
          asset_type: input.assetType,
          location: input.location,
        })
        .select('id')
        .single();
      if (error) fail('catalogar a obra', error);
      return { assetId: (data as { id: string }).id };
    },

    async updateAsset(input) {
      const { error } = await db
        .schema(MEDIA)
        .from('assets')
        .update({
          title: input.title,
          description: input.description,
          asset_type: input.assetType,
          location: input.location,
        })
        .eq('id', input.assetId)
        .eq('tenant_id', tenantId);
      if (error) fail('editar o registro', error);
    },

    async setAssetStatus(input) {
      const { error } = await db
        .schema(MEDIA)
        .from('assets')
        .update({ status: input.status })
        .eq('id', input.assetId)
        .eq('tenant_id', tenantId);
      if (error) fail('mover a obra no acervo', error);
    },

    async createTag(input) {
      const { data, error } = await db
        .schema(MEDIA)
        .from('tags')
        .insert({ tenant_id: tenantId, name: input.name })
        .select('id')
        .single();
      if (error) fail('criar a etiqueta', error);
      return { tagId: (data as { id: string }).id };
    },

    async tagAsset(input) {
      const { error } = await db
        .schema(MEDIA)
        .from('asset_tags')
        .insert({ tenant_id: tenantId, asset_id: input.assetId, tag_id: input.tagId });
      if (error) fail('etiquetar a obra', error);
    },

    async untagAsset(input) {
      const { error } = await db
        .schema(MEDIA)
        .from('asset_tags')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('asset_id', input.assetId)
        .eq('tag_id', input.tagId);
      if (error) fail('desfazer a etiqueta', error);
    },

    async recordUsage(input) {
      const { error } = await db.schema(MEDIA).from('usages').insert({
        tenant_id: tenantId,
        asset_id: input.assetId,
        used_in: input.usedIn,
        note: input.note,
      });
      if (error) fail('registrar o uso', error);
    },
  };
}
