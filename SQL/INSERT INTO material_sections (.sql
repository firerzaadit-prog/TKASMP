INSERT INTO material_sections (
    id,
    material_id,
    material_id,
    section_order,
    section_type,
    title,
    content,
    metadata,
    created_at,
    updated_at
  )
VALUES (
    'id:uuid',
    'material_id:uuid',
    'material_id:uuid',
    section_order:integer,
    'section_type:character varying',
    'title:character varying',
    'content:text',
    'metadata:jsonb',
    'created_at:timestamp with time zone',
    'updated_at:timestamp with time zone'
  );