INSERT INTO assessment_interactions (
    id,
    session_id,
    user_id,
    concept_id,
    interaction_type,
    interaction_data,
    timestamp,
    time_since_start,
    time_since_last_activity
  )
VALUES (
    'id:uuid',
    'session_id:uuid',
    'user_id:uuid',
    'concept_id:text',
    'interaction_type:text',
    'interaction_data:jsonb',
    'timestamp:timestamp with time zone',
    time_since_start:integer,
    time_since_last_activity:integer
  );