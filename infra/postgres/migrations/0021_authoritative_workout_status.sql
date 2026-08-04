WITH derived_status AS (
  SELECT
    session.id,
    CASE
      WHEN COUNT(set_row.id) > 0 AND BOOL_AND(set_row.completed) THEN 'completed'
      ELSE 'partial'
    END AS status
  FROM workout_sessions AS session
  LEFT JOIN workout_exercises AS exercise ON exercise.workout_id = session.id
  LEFT JOIN workout_sets AS set_row ON set_row.exercise_id = exercise.id
  GROUP BY session.id
)
UPDATE workout_sessions AS session
SET status = derived_status.status
FROM derived_status
WHERE session.id = derived_status.id
  AND session.status IS DISTINCT FROM derived_status.status;

COMMENT ON COLUMN workout_sessions.status IS
  'Server-derived cache: completed only when every persisted workout set is completed.';
