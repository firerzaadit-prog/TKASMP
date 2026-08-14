INSERT INTO question_analytics (
    id,
    question_id,
    total_attempts,
    correct_attempts,
    average_time_seconds,
    difficulty_rating,
    discrimination_index,
    created_at,
    updated_at
  )
VALUES (
    'id:uuid',
    'question_id:uuid',
    total_attempts:integer,
    correct_attempts:integer,
    average_time_seconds:numeric,
    difficulty_rating:numeric,
    discrimination_index:numeric,
    'created_at:timestamp with time zone',
    'updated_at:timestamp with time zone'
  );