INSERT INTO concept_progress_history (
    id,
    student_id,
    concept_id,
    mastery_level,
    performance_score,
    time_spent_seconds,
    attempt_count,
    difficulty_level,
    learning_velocity,
    recorded_at,
    session_id,
    metadata
  )
VALUES (
    'id:uuid',
    'student_id:uuid',
    'concept_id:character varying',
    'mastery_level:double precision',
    'performance_score:double precision',
    time_spent_seconds:integer,
    attempt_count:integer,
    difficulty_level:integer,
    'learning_velocity:double precision',
    'recorded_at:timestamp with time zone',
    'session_id:uuid',
    'metadata:jsonb'
  );