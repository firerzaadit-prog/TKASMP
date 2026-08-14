INSERT INTO exam_answers (
    id,
    exam_session_id,
    question_id,
    question_id,
    selected_answer,
    is_correct,
    time_taken_seconds,
    created_at,
    answered_at,
    user_answer,
    is_doubtful
  )
VALUES (
    'id:uuid',
    'exam_session_id:uuid',
    'question_id:uuid',
    'question_id:uuid',
    'selected_answer:text',
    is_correct:boolean,
    time_taken_seconds:integer,
    'created_at:timestamp without time zone',
    'answered_at:timestamp with time zone',
    'user_answer:text',
    is_doubtful:boolean
  );