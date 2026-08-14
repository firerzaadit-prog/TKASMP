INSERT INTO adaptation_effectiveness (
	id,
	user_id,
	content_id,
	adaptation_strategy,
	performance_score,
	effectiveness_score,
	recorded_at
  )
VALUES (
	'id:uuid',
	'user_id:uuid',
	'content_id:uuid',
	'adaptation_strategy:jsonb',
	'performance_score:double precision',
	'effectiveness_score:double precision',
	'recorded_at:timestamp with time zone'
  );