INSERT INTO question_sets (
    id,
    title,
    description,
    total_questions,
    time_limit_minutes,
    passing_score,
    is_active,
    created_by,
    created_at,
    updated_at
  )
VALUES (
    'id:uuid',
    'title:character varying',
    'description:text',
    total_questions:integer,
    time_limit_minutes:integer,
    passing_score:integer,
    is_active:boolean,
    'created_by:uuid',
    'created_at:timestamp with time zone',
    'updated_at:timestamp with time zone'
  );