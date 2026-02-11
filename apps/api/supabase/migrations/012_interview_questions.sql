-- ============================================
-- Interview Questions (想定質問)
-- Phase 9: 面接想定質問の入力・自動生成機能
-- ============================================

-- documents.type に 'expected_qa' を追加
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_type_check;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_type_check
  CHECK (type IN ('resume', 'job_posting', 'expected_qa'));

-- Interview Questions テーブル
CREATE TABLE public.interview_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Q&A内容
  question TEXT NOT NULL,
  answer TEXT NOT NULL DEFAULT '',

  -- メタデータ
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_auto_generated BOOLEAN NOT NULL DEFAULT false,

  -- RAG embedding用のchunkへのリンク
  chunk_id UUID REFERENCES public.document_chunks(id) ON DELETE SET NULL,

  -- タイムスタンプ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- インデックス
CREATE INDEX idx_interview_questions_user_id
  ON public.interview_questions(user_id);
CREATE INDEX idx_interview_questions_sort_order
  ON public.interview_questions(user_id, sort_order);

-- RLS
ALTER TABLE public.interview_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "interview_questions_all_own" ON public.interview_questions
  FOR ALL USING (true);

-- updated_at 自動更新トリガー
CREATE TRIGGER update_interview_questions_updated_at
  BEFORE UPDATE ON public.interview_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
