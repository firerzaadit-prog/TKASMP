INSERT INTO adaptive_content (
    id,
    title,
    content,
    difficulty_level,
    prerequisites,
    subject,
    created_at,
    updated_at
  )
VALUES (
    'id:uuid',
    'title:text',
    'content:text',
    difficulty_level:integer,
    'prerequisites:ARRAY',
    'subject:character varying',
    'created_at:timestamp with time zone',
    'updated_at:timestamp with time zone'
  );