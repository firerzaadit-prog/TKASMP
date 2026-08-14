INSERT INTO admin_users (
    id,
    id,
    email,
    full_name,
    role,
    is_active,
    created_at,
    updated_at,
    last_login_at,
    admin_level,
    permissions,
    login_count,
    created_by,
    notes,
    is_admin
  )
VALUES (
    'id:uuid',
    'id:uuid',
    'email:text',
    'full_name:text',
    'role:text',
    is_active:boolean,
    'created_at:timestamp with time zone',
    'updated_at:timestamp with time zone',
    'last_login_at:timestamp with time zone',
    'admin_level:character varying',
    'permissions:jsonb',
    login_count:integer,
    'created_by:uuid',
    'notes:text',
    is_admin:boolean
  );