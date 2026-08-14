INSERT INTO profiles (
    id,
    id,
    full_name,
    email,
    avatar_url,
    created_at,
    updated_at,
    kata_sandi_hash,
    nama_lengkap,
    phone,
    school,
    bio,
    class_name,
    role,
    username
  )
VALUES (
    'id:uuid',
    'id:uuid',
    'full_name:text',
    'email:text',
    'avatar_url:text',
    'created_at:timestamp with time zone',
    'updated_at:timestamp with time zone',
    'kata_sandi_hash:text',
    'nama_lengkap:text',
    'phone:text',
    'school:text',
    'bio:text',
    'class_name:text',
    'role:USER-DEFINED',
    'username:character varying'
  );