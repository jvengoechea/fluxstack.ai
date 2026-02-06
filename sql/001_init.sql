create extension if not exists pgcrypto;

create table if not exists tools (
  id text primary key,
  name text not null,
  category text not null,
  description text not null,
  tags text[] not null default '{}',
  url text not null,
  votes integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists submissions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null,
  description text not null,
  tags text[] not null default '{}',
  url text not null,
  votes integer not null default 0,
  submitted_at timestamptz not null default now()
);

insert into tools (id, name, category, description, tags, url, votes)
values
  ('tool-chatgpt', 'ChatGPT', 'Writing', 'General-purpose AI assistant for drafting, ideation, and synthesis.', '{chat,brainstorm,workflow}', 'https://chatgpt.com', 128),
  ('tool-perplexity', 'Perplexity', 'Research', 'Answer engine for quick research with citations and follow-up exploration.', '{search,citations,learning}', 'https://www.perplexity.ai', 97),
  ('tool-midjourney', 'Midjourney', 'Image', 'High-quality image generation for concept art, campaigns, and ideation.', '{art,design,imagination}', 'https://www.midjourney.com', 110),
  ('tool-runway', 'Runway', 'Video', 'AI-assisted video creation, motion transfer, and content generation tools.', '{editing,motion,creator}', 'https://runwayml.com', 82),
  ('tool-elevenlabs', 'ElevenLabs', 'Audio', 'Natural voice synthesis and cloning for narration and audio experiences.', '{voice,tts,podcast}', 'https://elevenlabs.io', 91),
  ('tool-cursor', 'Cursor', 'Coding', 'AI-native code editor for faster implementation and refactors.', '{developer,pair-programming,productivity}', 'https://www.cursor.com', 104),
  ('tool-notion-ai', 'Notion AI', 'Productivity', 'Integrated writing, summarization, and task support in workspace docs.', '{notes,planning,teams}', 'https://www.notion.so/product/ai', 71),
  ('tool-synthesia', 'Synthesia', 'Video', 'Create presenter videos from script with multilingual avatar output.', '{presentations,training,localization}', 'https://www.synthesia.io', 64)
on conflict (id) do nothing;
