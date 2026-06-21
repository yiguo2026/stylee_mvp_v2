-- Stylee MVP — Supabase SQL Schema
-- Run this in Supabase SQL Editor

-- Enable RLS (Row Level Security) for all tables
-- Users can only read/write their own data

-- ─────────────────────────────────────────
-- users (User profile)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('female', 'male', 'other', 'private')) DEFAULT 'private',
  age INTEGER,
  profession TEXT,
  permanent_city TEXT,
  avatar_url TEXT,
  body_shape TEXT,
  skin_tone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON users FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON users FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- tags (Style tag system)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  tag_id TEXT PRIMARY KEY,
  tag_name TEXT NOT NULL,
  tag_type TEXT CHECK (tag_type IN ('occasion', 'style', 'season', 'color_system', 'custom')) NOT NULL,
  icon TEXT
);

-- Seed preset tags
INSERT INTO tags (tag_id, tag_name, tag_type) VALUES
  ('casual', '休闲', 'style'),
  ('elegant', '优雅', 'style'),
  ('french', '法式', 'style'),
  ('street', '街头', 'style'),
  ('minimalist', '极简', 'style'),
  ('vintage', '复古', 'style'),
  ('sport', '运动', 'style'),
  ('bohemian', '波西米亚', 'style'),
  ('preppy', '学院', 'style'),
  ('feminine', '甜美', 'style'),
  ('commute', '通勤', 'style'),
  ('gentle', '温柔', 'style'),
  ('korean', '韩系', 'style'),
  ('japanese', '日系', 'style'),
  ('cool', '酷帅', 'style'),
  ('artsy', '文艺', 'style'),
  ('old_money', '老钱风', 'style'),
  ('city_chic', '都市', 'style'),
  ('cottagecore', '田园', 'style'),
  ('dark_academia', '暗黑学院', 'style'),
  ('gorpcore', '户外机能', 'style'),
  ('romantic', '浪漫', 'style'),
  ('smart_casual', '商务休闲', 'style'),
  ('normcore', '基础款', 'style'),
  ('y2k', 'Y2K', 'style'),
  ('mori', '森系', 'style'),
  ('punk', '朋克', 'style'),
  ('oversize', 'Oversize', 'style'),
  ('dark', '暗黑', 'style'),
  ('hiphop', '嘻哈', 'style'),
  ('sexy', '性感', 'style'),
  ('avantgarde', '前卫', 'style'),
  ('ethnic', '民族', 'style'),
  ('luxury', '奢华', 'style'),
  ('logo_mania', '大Logo', 'style'),
  ('neon', '荧光色', 'style'),
  ('sheer', '透视', 'style'),
  ('crop', '露脐', 'style'),
  ('matchy', '成套穿', 'style'),
  ('childlike', '幼稚', 'style'),
  ('daily', '日常', 'occasion'),
  ('work', '工作', 'occasion'),
  ('date', '约会', 'occasion'),
  ('party', '派对', 'occasion'),
  ('travel', '旅行', 'occasion'),
  ('interview', '面试', 'occasion'),
  ('ceremony', '典礼', 'occasion'),
  ('holiday', '度假', 'occasion'),
  ('gathering', '聚会', 'occasion')
ON CONFLICT (tag_id) DO NOTHING;

-- Allow anon/authenticated to read tags (needed for style preference UI)
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tags are publicly readable" ON tags FOR SELECT USING (true);
CREATE POLICY "Service role can insert tags" ON tags FOR INSERT WITH CHECK (true);

-- ─────────────────────────────────────────
-- user_style_preferences
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_style_preferences (
  preference_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
  tag_id TEXT REFERENCES tags(tag_id) NOT NULL,
  preference_type TEXT CHECK (preference_type IN ('like', 'dislike')) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tag_id)
);

ALTER TABLE user_style_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own preferences" ON user_style_preferences
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- wardrobe_items
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wardrobe_items (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT CHECK (category IN ('上装', '下装', '外套', '鞋', '包', '配饰')) NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  material TEXT,
  brand TEXT,
  price DECIMAL(10, 2),
  image_url TEXT,
  source_type TEXT CHECK (source_type IN ('manual', 'photo_ai', 'album_ai', 'link_import')) DEFAULT 'manual',
  fit_type TEXT,
  ai_recognized_attrs JSONB,
  status TEXT CHECK (status IN ('active', 'inactive', 'archived')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wardrobe" ON wardrobe_items
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- outfits
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outfits (
  outfit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
  session_id TEXT,
  name TEXT,
  ai_comment TEXT,
  source TEXT CHECK (source IN ('ai_generated', 'user_created')) DEFAULT 'ai_generated',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE outfits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own outfits" ON outfits
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- outfit_items (Outfit <-> WardrobeItem join)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outfit_items (
  outfit_id UUID REFERENCES outfits(outfit_id) ON DELETE CASCADE NOT NULL,
  item_id UUID REFERENCES wardrobe_items(item_id) ON DELETE CASCADE NOT NULL,
  role TEXT,
  display_order INTEGER DEFAULT 0,
  PRIMARY KEY (outfit_id, item_id)
);

ALTER TABLE outfit_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users access own outfit_items" ON outfit_items
  USING (
    EXISTS (
      SELECT 1 FROM outfits o WHERE o.outfit_id = outfit_items.outfit_id AND o.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────
-- Storage: wardrobe-images bucket
-- ─────────────────────────────────────────
-- STEP 1 (Dashboard only): Storage → New bucket
--   Name: wardrobe-images   Public: ON   (so images load without auth tokens)
--
-- STEP 2: Run this SQL to add RLS policies on the bucket:

INSERT INTO storage.buckets (id, name, public)
  VALUES ('wardrobe-images', 'wardrobe-images', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'wardrobe-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'wardrobe-images'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Public read wardrobe images" ON storage.objects
  FOR SELECT USING (bucket_id = 'wardrobe-images');

-- ─────────────────────────────────────────
-- Auth settings reminder
-- ─────────────────────────────────────────
-- For easier testing, disable email confirmation:
--   Authentication → Providers → Email → "Confirm email" → OFF
-- (Re-enable before production launch)
