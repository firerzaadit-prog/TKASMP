INSERT INTO category_answers (
    id,
    exam_session_id,
    exam_session_id,
    question_id,
    question_id,
    statement_text,
    selected_answer,
    is_correct,
    created_at,
    updated_at
  )
VALUES (
    'id:uuid',
    'exam_session_id:uuid',
    'exam_session_id:uuid',
    'question_id:uuid',
    'question_id:uuid',
    'statement_text:text',
    selected_answer:boolean,
    is_correct:boolean,
    'created_at:timestamp with time zone',
    'updated_at:timestamp with time zone'
  );