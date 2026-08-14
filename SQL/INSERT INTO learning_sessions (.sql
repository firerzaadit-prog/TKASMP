INSERT INTO learning_sessions (
    id,
    student_id,
    content_id,
    session_start,
    session_end,
    performance_score,
    time_spent_seconds,
    created_at
  )
VALUES (
    'id:uuid',
    'student_id:uuid',
    'content_id:uuid',
    'session_start:timestamp with time zone',
    'session_end:timestamp with time zone',
    'performance_score:double precision',
    time_spent_seconds:integer,
    'created_at:timestamp with time zone'
  );