INSERT INTO question_parameters (
    id,
    question_id,
    concept_id,
    difficulty,
    discrimination,
    guessing,
    updated_at
  )
VALUES (
    'id:uuid',
    'question_id:uuid',
    'concept_id:text',
    'difficulty:double precision',
    'discrimination:double precision',
    'guessing:double precision',
    'updated_at:timestamp with time zone'
  );