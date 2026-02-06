alter table if exists tools add column if not exists thumbnail_url text;
alter table if exists tools add column if not exists demo_video_url text;
alter table if exists submissions add column if not exists thumbnail_url text;
alter table if exists submissions add column if not exists demo_video_url text;
