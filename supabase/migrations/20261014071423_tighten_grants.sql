-- Signed-in users only need row-level read/write; TRUNCATE in particular would bypass row level security.
revoke truncate, references, trigger on public.folders, public.notes from authenticated;
