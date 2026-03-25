-- pgvector iterative scan を有効化
-- HNSWインデックスで user_id フィルタ付き検索時に LIMIT 件数に満たない問題を解決
-- 前提: pgvector 0.8.0+
--
-- 変更点:
--   1. LANGUAGE sql → LANGUAGE plpgsql (SET LOCAL を使うため)
--   2. SET LOCAL hnsw.iterative_scan = 'relaxed_order' で反復スキャン有効化
--   3. SET LOCAL hnsw.max_scan_tuples = 20000 でスキャン上限設定

CREATE OR REPLACE FUNCTION match_documents_with_info(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  p_user_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  document_id uuid,
  document_name text,
  document_type text
)
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  -- iterative scan: HNSW がフィルタで候補を落としても LIMIT 件数まで再探索する
  SET LOCAL hnsw.iterative_scan = 'relaxed_order';
  -- 安全弁: 最大スキャンタプル数（デフォルト無制限を制限してコスト暴走を防止）
  SET LOCAL hnsw.max_scan_tuples = 20000;

  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    d.id AS document_id,
    d.name AS document_name,
    d.type AS document_type
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE dc.user_id = p_user_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

COMMENT ON FUNCTION match_documents_with_info IS
  'match_documents + documents JOIN の最適化版。pgvector iterative scan 対応（plpgsql）。';

-- ロールバック:
-- CREATE OR REPLACE FUNCTION match_documents_with_info(
--   query_embedding vector(1536),
--   match_threshold float,
--   match_count int,
--   p_user_id uuid
-- )
-- RETURNS TABLE (
--   id uuid,
--   content text,
--   similarity float,
--   document_id uuid,
--   document_name text,
--   document_type text
-- )
-- LANGUAGE sql STABLE
-- AS $$
--   SELECT
--     dc.id,
--     dc.content,
--     1 - (dc.embedding <=> query_embedding) AS similarity,
--     d.id AS document_id,
--     d.name AS document_name,
--     d.type AS document_type
--   FROM document_chunks dc
--   JOIN documents d ON d.id = dc.document_id
--   WHERE dc.user_id = p_user_id
--     AND 1 - (dc.embedding <=> query_embedding) > match_threshold
--   ORDER BY dc.embedding <=> query_embedding
--   LIMIT match_count;
-- $$;
