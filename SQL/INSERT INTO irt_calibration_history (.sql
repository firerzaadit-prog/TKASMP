INSERT INTO irt_calibration_history (
    id,
    calibration_date,
    total_items_calibrated,
    average_difficulty,
    average_discrimination,
    valid_items_count,
    invalid_items_count,
    calibration_details,
    created_at
  )
VALUES (
    'id:uuid',
    'calibration_date:timestamp with time zone',
    total_items_calibrated:integer,
    'average_difficulty:double precision',
    'average_discrimination:double precision',
    valid_items_count:integer,
    invalid_items_count:integer,
    'calibration_details:jsonb',
    'created_at:timestamp with time zone'
  );