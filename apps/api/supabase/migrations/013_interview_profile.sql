-- 面接プロフィール: 構造化された個人情報をAIコンテキストに常時注入するためのJSONBカラム
-- フィールド: fullName, nameReading, currentCompany, currentPosition,
--            previousCompanies[], targetCompany, targetPosition,
--            technologies[], certifications[], education, yearsOfExperience,
--            additionalNotes

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS interview_profile JSONB DEFAULT NULL;

COMMENT ON COLUMN public.profiles.interview_profile IS
  'Structured interview profile data (name, companies, technologies, etc.) injected into AI context';
