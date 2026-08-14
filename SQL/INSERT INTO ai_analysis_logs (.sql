INSERT INTO ai_analysis_logs (
    id,
    analysis_type,
    input_data,
    output_data,
    confidence_score,
    processing_time_ms,
    created_at
  )
VALUES (
    'id:uuid',
    'analysis_type:character varying',
    'input_data:jsonb',
    'output_data:jsonb',
    confidence_score:numeric,
    processing_time_ms:integer,
    'created_at:timestamp with time zone'
  );