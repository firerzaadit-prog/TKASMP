INSERT INTO student_analytics (
    id,
    user_id,
    user_id,
    chapter,
    sub_chapter,
    total_questions_attempted,
    correct_answers,
    average_time_seconds,
    mastery_level,
    skill_radar_data,
    last_updated,
    created_at
  )
VALUES (
    'id:uuid',
    'user_id:uuid',
    'user_id:uuid',
    'chapter:text',
    'sub_chapter:text',
    total_questions_attempted:integer,
    correct_answers:integer,
    average_time_seconds:numeric,
    mastery_level:numeric,
    'skill_radar_data:jsonb',
    'last_updated:timestamp with time zone',
    'created_at:timestamp with time zone'
  );