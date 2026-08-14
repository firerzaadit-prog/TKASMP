INSERT INTO assessment_responses (
    id,
    session_id,
    question_id,
    selected_answer,
    is_correct,
    time_spent,
    knowledge_state,
    timestamp
  )
VALUES (
    'id:uuid',
    'session_id:uuid',
    'question_id:uuid',
    'selected_answer:text',
    is_correct:boolean,
    time_spent:integer,
    'knowledge_state:double precision',
    'timestamp:timestamp with time zone'
  );