INSERT INTO admin_activities (
    id,
    admin_id,
    activity_type,
    action,
    title,
    description,
    entity_type,
    entity_id,
    metadata,
    ip_address,
    user_agent,
    created_at
  )
VALUES (
    'id:uuid',
    'admin_id:uuid',
    'activity_type:character varying',
    'action:character varying',
    'title:character varying',
    'description:text',
    'entity_type:character varying',
    'entity_id:uuid',
    'metadata:jsonb',
    'ip_address:inet',
    'user_agent:text',
    'created_at:timestamp with time zone'
  );