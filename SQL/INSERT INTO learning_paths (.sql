INSERT INTO learning_paths (
    id,
    student_id,
    path_name,
    content_sequence,
    created_at,
    updated_at
  )
VALUES (
    'id:uuid',
    'student_id:uuid',
    'path_name:text',
    'content_sequence:ARRAY',
    'created_at:timestamp with time zone',
    'updated_at:timestamp with time zone'
  );