INSERT INTO progress_analytics_cache (
    id,
    student_id,
    student_id,
    concept_id,
    analytics_type,
    data,
    computed_at,
    valid_until
  )
VALUES (
    'id:uuid',
    'student_id:uuid',
    'student_id:uuid',
    'concept_id:character varying',
    'analytics_type:character varying',
    'data:jsonb',
    'computed_at:timestamp with time zone',
    'valid_until:timestamp with time zone'
  );