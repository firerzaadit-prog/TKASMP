INSERT INTO content_adaptations (
    id,
    user_id,
    content_id,
    strategy,
    performance_score,
    timestamp,
    created_at
  )
VALUES (
    'id:uuid',
    'user_id:uuid',
    'content_id:uuid',
    'strategy:jsonb',
    'performance_score:double precision',
    'timestamp:timestamp with time zone',
    'created_at:timestamp with time zone'
  );