-- match_documents_with_info: match_documents + documents JOIN の最適化版
-- 2ステップ（RPC → SELECT）を1ステップに統合して -20~50ms 削減
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
LANGUAGE sql STABLE
AS $$
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
$$;

COMMENT ON FUNCTION match_documents_with_info IS
  'match_documents + documents JOIN の最適化版。追加SELECTを廃止した1ステップ版。';
