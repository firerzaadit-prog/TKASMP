INSERT INTO admin_audit_log (
    id,
    admin_id,
    action,
    entity_type,
    entity_id,
    old_values,
    new_values,
    ip_address,
    user_agent,
    created_at
  )
VALUES (
    'id:uuid',
    'admin_id:uuid',
    'action:character varying',
    'entity_type:character varying',
    'entity_id:uuid',
    'old_values:jsonb',
    'new_values:jsonb',
    'ip_address:inet',
    'user_agent:text',
    'created_at:timestamp with time zone'
  );