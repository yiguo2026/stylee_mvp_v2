-- Stylee MVP v2 — Supabase SQL Schema
-- Run this in Supabase SQL Editor
-- Updated: 2026-06-21

-- ─────────────────────────────────────────
-- users (User profile)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  nickname TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('female', 'male', 'other', 'private')) DEFAULT 'private',
  age INTEGER,
  profession TEXT,
  permanent_city TEXT,
  avatar_url TEXT,
  body_shape TEXT CHECK (body_shape IN ('沙漏形', '梨形', '苹果形', '倒三角', '矩形')),
  skin_tone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON users FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON users FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON users FOR UPDATE USING (auth.uid() = user_id);
-- Allow reading username for uniqueness check during registration
CREATE POLICY "Username is publicly readable" ON users FOR SELECT USING (true);

-- ─────────────────────────────────────────
-- tags (Style tag system — v2 updated)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  tag_id TEXT PRIMARY KEY,
  tag_name TEXT NOT NULL,
  tag_type TEXT CHECK (tag_type IN ('occasion', 'style', 'season', 'color_system', 'custom')) NOT NULL,
  icon TEXT,
  image_url TEXT,
  sort_order INTEGER DEFAULT 0
);

-- v2 tags: occasion (6), style (14 like + 14 dislike), color_system (8)
INSERT INTO tags (tag_id, tag_name, tag_type, sort_order) VALUES
  -- Occasion (6)
  ('commute', '通勤', 'occasion', 1),
  ('date', '约会', 'occasion', 2),
  ('travel', '出游', 'occasion', 3),
  ('casual', '休闲', 'occasion', 4),
  ('work', '职场', 'occasion', 5),
  ('sport', '运动', 'occasion', 6),
  -- Style — Like (14)
  ('korean', '韩系风', 'style', 1),
  ('sweet', '甜美风', 'style', 2),
  ('new_chinese', '新中式', 'style', 3),
  ('preppy', '学院风', 'style', 4),
  ('city_chic', '都市风', 'style', 5),
  ('artsy', '文艺风', 'style', 6),
  ('sporty_casual', '运动休闲', 'style', 7),
  ('commute_style', '通勤风', 'style', 8),
  ('french', '法式', 'style', 9),
  ('maillard', '美拉德风', 'style', 10),
  ('japanese', '日系风', 'style', 11),
  ('business', '商务风', 'style', 12),
  ('american', '美式', 'style', 13),
  ('british', '英伦风', 'style', 14),
  -- Style — Dislike (14)
  ('punk', '朋克', 'style', 15),
  ('oversize', 'Oversize', 'style', 16),
  ('dark', '暗黑', 'style', 17),
  ('hiphop', '嘻哈', 'style', 18),
  ('sexy', '性感', 'style', 19),
  ('avantgarde', '前卫', 'style', 20),
  ('ethnic', '民族', 'style', 21),
  ('luxury', '奢华', 'style', 22),
  ('logo_mania', '大Logo', 'style', 23),
  ('neon', '荧光色', 'style', 24),
  ('sheer', '透视', 'style', 25),
  ('crop', '露脐', 'style', 26),
  ('matchy', '成套穿', 'style', 27),
  ('childlike', '幼稚', 'style', 28),
  -- Color system (8)
  ('black', '黑色系', 'color_system', 1),
  ('white', '白色系', 'color_system', 2),
  ('gray', '灰色系', 'color_system', 3),
  ('blue', '蓝色系', 'color_system', 4),
  ('green', '绿色系', 'color_system', 5),
  ('warm', '暖色系', 'color_system', 6),
  ('morandi', '莫兰迪', 'color_system', 7),
  ('clash', '撞色', 'color_system', 8)
ON CONFLICT (tag_id) DO UPDATE SET
  tag_name = EXCLUDED.tag_name,
  tag_type = EXCLUDED.tag_type,
  sort_order = EXCLUDED.sort_order;

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
-- wardrobe_items (v2: extended fields)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wardrobe_items (
  item_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT CHECK (category IN ('上装', '下装', '连体装', '外套', '鞋', '包', '帽子', '围巾')) NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  material TEXT,
  brand TEXT,
  price DECIMAL(10, 2),
  images JSONB DEFAULT '[]',           -- v2: 多图URL数组
  image_url TEXT,                        -- 主图（兼容）
  source_type TEXT CHECK (source_type IN ('manual', 'photo_ai', 'album_ai', 'ai_recommended', 'link')) DEFAULT 'manual',
  source_label TEXT DEFAULT '手动添加',   -- v2: '手动添加' | 'AI推荐添加'
  fit_type TEXT,
  sleeve_length TEXT CHECK (sleeve_length IN ('无袖', '短袖', '长袖')),
  season JSONB DEFAULT '[]',             -- v2: 多选季节 ["春","夏","秋","冬"]
  purchase_date DATE,
  occasion_tags JSONB DEFAULT '[]',      -- v2: 场合标签数组
  ai_recognized_attrs JSONB,
  status TEXT CHECK (status IN ('active', 'inactive', 'archived')) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wardrobe_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wardrobe" ON wardrobe_items
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- outfits (v2: extended fields)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outfits (
  outfit_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
  session_id TEXT,
  name TEXT,
  ai_comment TEXT,
  source TEXT CHECK (source IN ('ai_generated', 'user_created')) DEFAULT 'ai_generated',
  style_tags JSONB DEFAULT '[]',         -- v2: 风格标签
  occasion_tag TEXT,                      -- v2: 场合标签
  temp_range TEXT,                        -- v2: 温度范围
  try_on_images JSONB DEFAULT '[]',      -- v2: AI试穿效果图URL数组
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
-- outfit_favorites (v2: 收藏搭配)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS outfit_favorites (
  favorite_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
  outfit_id UUID REFERENCES outfits(outfit_id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, outfit_id)
);

ALTER TABLE outfit_favorites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own favorites" ON outfit_favorites
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- wishlist_items (v2: 心愿单)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wishlist_items (
  wish_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT CHECK (category IN ('上装', '下装', '连体装', '外套', '鞋', '包', '帽子', '围巾')) NOT NULL,
  color TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  description TEXT,
  source TEXT CHECK (source IN ('ai_recommended', 'user_added')) DEFAULT 'ai_recommended',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wishlist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wishlist" ON wishlist_items
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- inspiration_cards (v2: 穿搭灵感)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inspiration_cards (
  card_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  style_tags JSONB DEFAULT '[]',
  comment TEXT,
  occasion TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE inspiration_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Inspiration cards are publicly readable" ON inspiration_cards FOR SELECT USING (true);

-- ─────────────────────────────────────────
-- user_body_models (v2: AI试穿身体信息)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_body_models (
  model_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
  selfie_url TEXT,
  fullbody_url TEXT,
  body_shape TEXT CHECK (body_shape IN ('沙漏形', '梨形', '苹果形', '倒三角', '矩形')),
  model_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE user_body_models ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own body model" ON user_body_models
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- wear_events (穿着记录)
-- ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wear_events (
  wear_event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(user_id) ON DELETE CASCADE NOT NULL,
  outfit_id UUID REFERENCES outfits(outfit_id) ON DELETE CASCADE NOT NULL,
  wear_date DATE NOT NULL,
  rating INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE wear_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own wear events" ON wear_events
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ─────────────────────────────────────────
-- Storage: wardrobe-images bucket
-- ─────────────────────────────────────────
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
-- Storage: body-photos bucket (v2: AI试穿照片)
-- ─────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
  VALUES ('body-photos', 'body-photos', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own body photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'body-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users read own body photos" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'body-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users delete own body photos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'body-photos'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- ─────────────────────────────────────────
-- Auth settings reminder
-- ─────────────────────────────────────────
-- For easier testing, disable email confirmation:
--   Authentication → Providers → Email → "Confirm email" → OFF
-- (Re-enable before production launch)
