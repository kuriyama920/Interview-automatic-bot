-- Phase 6: storage_path をNULLABLEに変更
-- 理由: Phase 6ではファイルをSupabase Storageに保存せず、
-- 直接テキスト抽出・Embedding生成を行うため、storage_pathは不要

ALTER TABLE public.documents
  ALTER COLUMN storage_path DROP NOT NULL;

-- storage_pathのデフォルト値を設定（既存のコード互換性のため）
COMMENT ON COLUMN public.documents.storage_path IS 'Optional: file path in Supabase Storage. NULL for Phase 6+ (direct processing)';
