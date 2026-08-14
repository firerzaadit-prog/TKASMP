INSERT INTO assessment_sessions (
    id,
    user_id,
    concept_id,
    start_time,
    end_time,
    status,
    final_knowledge_state,
    engagement_score,
    questions_answered,
    accuracy,
    created_at,
    updated_at
  )
VALUES (
    'id:uuid',
    'user_id:uuid',
    'concept_id:text',
    'start_time:timestamp with time zone',
    'end_time:timestamp with time zone',
    'status:text',
    'final_knowledge_state:double precision',
    'engagement_score:double precision',
    questions_answered:integer,
    'accuracy:double precision',
    'created_at:timestamp with time zone',
    'updated_at:timestamp with time zone'
  );