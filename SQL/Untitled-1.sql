INSERT INTO user_adaptation_preferences (
    id,
    user_id,
    user_id,
    preferred_difficulty,
    learning_style,
    pace_preference,
    multimedia_preferences,
    hint_preference,
    created_at,
    updated_at
  )
VALUES (
    'id:uuid',
    'user_id:uuid',
    'user_id:uuid',
    'preferred_difficulty:jsonb',
    'learning_style:character varying',
    'pace_preference:character varying',
    'multimedia_preferences:jsonb',
    'hint_preference:character varying',
    'created_at:timestamp with time zone',
    'updated_at:timestamp with time zone'
  );