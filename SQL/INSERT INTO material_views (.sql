INSERT INTO material_views (
    id,
    user_id,
    material_id,
    viewed_at,
    view_duration_seconds
  )
VALUES (
    'id:uuid',
    'user_id:uuid',
    'material_id:uuid',
    'viewed_at:timestamp with time zone',
    view_duration_seconds:integer
  );