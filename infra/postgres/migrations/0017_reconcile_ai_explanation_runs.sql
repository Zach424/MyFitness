ALTER TABLE ai_explanation_runs
  ADD COLUMN recovery_content JSONB,
  ADD COLUMN expires_at TIMESTAMPTZ;

UPDATE ai_explanation_runs
SET recovery_content = CASE
      WHEN status = 'pending' THEN
        '{
          "headline": "上次说明已安全结束",
          "overview": "生成过程没有留下可确认的结果，系统保留原计划并结束本次请求。",
          "highlights": [
            {
              "title": "计划没有改变",
              "detail": "解释流程不能修改训练安排或饮食关注点。",
              "evidenceKeys": ["plan_schedule"]
            },
            {
              "title": "可重新确认当前版本",
              "detail": "回到当前周计划，确认仍适合后再重新生成说明。",
              "evidenceKeys": ["plan_experience"]
            }
          ],
          "nextStep": "先查看当前计划；需要说明时使用新的请求重新生成。"
        }'::jsonb
      ELSE NULL
    END,
    expires_at = created_at + INTERVAL '2 minutes';

ALTER TABLE ai_explanation_runs
  ALTER COLUMN expires_at SET NOT NULL,
  ADD CONSTRAINT ai_explanation_runs_recovery_check CHECK (
    expires_at > created_at
    AND (
      (status = 'pending' AND recovery_content IS NOT NULL
        AND jsonb_typeof(recovery_content) = 'object')
      OR
      (status = 'completed' AND recovery_content IS NULL)
    )
  );

CREATE INDEX ai_explanation_runs_expiry_idx
  ON ai_explanation_runs (expires_at, created_at)
  WHERE status = 'pending';
