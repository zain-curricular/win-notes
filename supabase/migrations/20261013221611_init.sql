-- Folders ("projects") and notes, each owned by one user.
-- Timestamps are written by the client so the app can resolve conflicts with last-write-wins.

create table public.folders (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notes (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- No foreign key: a note whose folder is gone simply shows up in the default "Notes" folder.
  folder_id uuid,
  title text not null default '',
  snippet text not null default '',
  body text not null default '',
  content jsonb not null default '{}'::jsonb,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index folders_user_id_idx on public.folders (user_id);
create index notes_user_id_updated_at_idx on public.notes (user_id, updated_at desc);

alter table public.folders enable row level security;
alter table public.notes enable row level security;

create policy "folders: owner can read" on public.folders for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "folders: owner can insert" on public.folders for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "folders: owner can update" on public.folders for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "folders: owner can delete" on public.folders for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "notes: owner can read" on public.notes for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "notes: owner can insert" on public.notes for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "notes: owner can update" on public.notes for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "notes: owner can delete" on public.notes for delete to authenticated
  using ((select auth.uid()) = user_id);

-- New tables are no longer exposed to the Data API automatically.
grant select, insert, update, delete on public.folders, public.notes to authenticated;
revoke all on public.folders, public.notes from anon;

-- Push row changes to other signed-in devices.
alter publication supabase_realtime add table public.folders, public.notes;
