-- Bucket Storage "avatars" pour les photos de profil.
-- Le code (app/profile/edit.tsx) écrit dans le bucket "avatars" au chemin
-- `${userId}/avatar.jpg` (upsert) et lit via getPublicUrl → bucket PUBLIC,
-- écriture restreinte au dossier de l'utilisateur.
-- À exécuter dans Supabase SQL Editor (ou `supabase db push`).

-- 1. Bucket public "avatars" (idempotent)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public            = excluded.public,
      file_size_limit   = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2. Policies sur storage.objects (drop-if-exists pour ré-exécution sûre)
drop policy if exists "avatars_public_read" on storage.objects;
drop policy if exists "avatars_insert_own"  on storage.objects;
drop policy if exists "avatars_update_own"  on storage.objects;
drop policy if exists "avatars_delete_own"  on storage.objects;

-- Lecture publique (le bucket public sert déjà les URLs ; policy ajoutée par cohérence)
create policy "avatars_public_read"
  on storage.objects for select
  using ( bucket_id = 'avatars' );

-- Upload uniquement dans SON dossier (${uid}/...)
create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

-- Mise à jour (upsert écrase avatar.jpg) de SON dossier
create policy "avatars_update_own"
  on storage.objects for update to authenticated
  using      ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text )
  with check ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );

-- Suppression de SON dossier (optionnel mais cohérent)
create policy "avatars_delete_own"
  on storage.objects for delete to authenticated
  using ( bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text );
