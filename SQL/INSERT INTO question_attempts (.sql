INSERT INTO question_attempts (
    id,
    user_id,
    user_id,
    question_id,
    question_id,
    selected_answer,
    is_correct,
    time_taken_seconds,
    attempted_at
  )
VALUES (
    'id:uuid',
    'user_id:uuid',
    'user_id:uuid',
    'question_id:uuid',
    'question_id:uuid',
    'selected_answer:character',
    is_correct:boolean,
    time_taken_seconds:integer,
    'attempted_at:timestamp with time zone'
  );