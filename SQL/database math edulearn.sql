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
    'id:uuidINSERT INTO adaptive_content (
        id,
        title,
        content,
        difficulty_level,
        prerequisites,
        subject,
        created_at,
        updated_at
      )
    VALUES (
        'id:uuidINSERT INTO admin_activities (
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
            'id:uuidINSERT INTO admin_audit_log (
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
                'id:uuidINSERT INTO admin_users (
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
                    'id:uuidINSERT INTO ai_analysis_logs (
                        id,
                        analysis_type,
                        input_data,
                        output_data,
                        confidence_score,
                        processing_time_ms,
                        created_at
                      )
                    VALUES (
                        'id:uuidINSERT INTO assessment_interactions (
                            id,
                            session_id,
                            user_id,
                            concept_id,
                            interaction_type,
                            interaction_data,
                            timestamp,
                            time_since_start,
                            time_since_last_activity
                          )
                        VALUES (
                            'id:uuidINSERT INTO assessment_responses (
                                id,
                                session_id,
                                question_id,
                                selected_answer,
                                is_correct,
                                time_spent,
                                knowledge_state,
                                timestamp
                              )
                            VALUES (
                                'id:uuidINSERT INTO assessment_sessions (
                                    id,
                                    user_id,
                                    concept_id,
                                    start_time,
                                    end_time,
                                    status,
                                    final_knowledge_state,
                                    engagement_score,
                                    questions_answered,
                                    accuracy,
                                    created_at,
                                    updated_at
                                  )
                                VALUES (
                                    'id:uuidINSERT INTO bkt_parameters (id, concept_id, p_l0, p_t, p_g, p_s, updated_at)
                                    VALUES (
                                        'id:uuidINSERT INTO category_answers (
                                            id,
                                            exam_session_id,
                                            exam_session_id,
                                            question_id,
                                            question_id,
                                            statement_text,
                                            selected_answer,
                                            is_correct,
                                            created_at,
                                            updated_at
                                          )
                                        VALUES (
                                            'id:uuidINSERT INTO concept_mastery (
                                                id,
                                                student_id,
                                                student_id,
                                                content_id,
                                                content_id,
                                                mastery_level,
                                                last_updated
                                              )
                                            VALUES (
                                                'id:uuidINSERT INTO concept_milestones (
                                                    id,
                                                    student_id,
                                                    student_id,
                                                    concept_id,
                                                    milestone_type,
                                                    milestone_value,
                                                    achieved_at,
                                                    description
                                                  )
                                                VALUES (
                                                    'id:uuidINSERT INTO concept_progress_history (
                                                        id,
                                                        student_id,
                                                        concept_id,
                                                        mastery_level,
                                                        performance_score,
                                                        time_spent_seconds,
                                                        attempt_count,
                                                        difficulty_level,
                                                        learning_velocity,
                                                        recorded_at,
                                                        session_id,
                                                        metadata
                                                      )
                                                    VALUES (
                                                        'id:uuidINSERT INTO content_adaptations (
                                                            id,
                                                            user_id,
                                                            content_id,
                                                            strategy,
                                                            performance_score,
                                                            timestamp,
                                                            created_at
                                                          )
                                                        VALUES (
                                                            'id:uuidINSERT INTO exam_answers (
                                                                id,
                                                                exam_session_id,
                                                                question_id,
                                                                question_id,
                                                                selected_answer,
                                                                is_correct,
                                                                time_taken_seconds,
                                                                created_at,
                                                                answered_at,
                                                                user_answer,
                                                                is_doubtful
                                                              )
                                                            VALUES (
                                                                'id:uuidINSERT INTO exam_sessions (
                                                                    id,
                                                                    user_id,
                                                                    question_set_id,
                                                                    started_at,
                                                                    completed_at,
                                                                    total_time_seconds,
                                                                    total_score,
                                                                    passing_score,
                                                                    is_passed,
                                                                    status,
                                                                    created_at,
                                                                    updated_at,
                                                                    paket_soal,
                                                                    question_type_variant,
                                                                    is_paused,
                                                                    pause_started_at
                                                                  )
                                                                VALUES (
                                                                    'id:uuidINSERT INTO gemini_analyses (
                                                                        id,
                                                                        answer_id,
                                                                        answer_id,
                                                                        analysis_data,
                                                                        created_at,
                                                                        updated_at
                                                                      )
                                                                    VALUES (
                                                                        'id:uuidINSERT INTO irt_calibration_history (
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
                                                                            'id:uuidINSERT INTO learning_paths (
                                                                                id,
                                                                                student_id,
                                                                                path_name,
                                                                                content_sequence,
                                                                                created_at,
                                                                                updated_at
                                                                              )
                                                                            VALUES (
                                                                                'id:uuidINSERT INTO learning_sessions (
                                                                                    id,
                                                                                    student_id,
                                                                                    content_id,
                                                                                    session_start,
                                                                                    session_end,
                                                                                    performance_score,
                                                                                    time_spent_seconds,
                                                                                    created_at
                                                                                  )
                                                                                VALUES (
                                                                                    'id:uuidINSERT INTO material_progress (
                                                                                        id,
                                                                                        user_id,
                                                                                        user_id,
                                                                                        material_id,
                                                                                        material_id,
                                                                                        is_read,
                                                                                        read_at,
                                                                                        time_spent_seconds
                                                                                      )
                                                                                    VALUES (
                                                                                        'id:uuidINSERT INTO material_sections (
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
                                                                                            'id:uuidINSERT INTO material_views (
                                                                                                id,
                                                                                                user_id,
                                                                                                material_id,
                                                                                                viewed_at,
                                                                                                view_duration_seconds
                                                                                              )
                                                                                            VALUES (
                                                                                                'id:uuidINSERT INTO materials (
                                                                                                    id,
                                                                                                    title,
                                                                                                    description,
                                                                                                    created_at,
                                                                                                    updated_at,
                                                                                                    content,
                                                                                                    chapter,
                                                                                                    sub_chapter,
                                                                                                    subject,
                                                                                                    difficulty,
                                                                                                    material_type,
                                                                                                    tags,
                                                                                                    attachment_url,
                                                                                                    image_url,
                                                                                                    is_published,
                                                                                                    view_count,
                                                                                                    created_by,
                                                                                                    objectives
                                                                                                  )
                                                                                                VALUES (
                                                                                                    'id:uuidINSERT INTO profiles (
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
                                                                                                        'id:uuidINSERT INTO progress_analytics_cache (
                                                                                                            id,
                                                                                                            student_id,
                                                                                                            student_id,
                                                                                                            concept_id,
                                                                                                            analytics_type,
                                                                                                            data,
                                                                                                            computed_at,
                                                                                                            valid_until
                                                                                                          )
                                                                                                        VALUES (
                                                                                                            'id:uuidINSERT INTO question_analytics (
                                                                                                                id,
                                                                                                                question_id,
                                                                                                                total_attempts,
                                                                                                                correct_attempts,
                                                                                                                average_time_seconds,
                                                                                                                difficulty_rating,
                                                                                                                discrimination_index,
                                                                                                                created_at,
                                                                                                                updated_at
                                                                                                              )
                                                                                                            VALUES (
                                                                                                                'id:uuidINSERT INTO question_attempts (
                                                                                                                    id,
                                                                                                                    user_id,
                                                                                                                    user_id,
                                                                                                                    question_id,
                                                                                                                    question_id,
                                                                                                                    selected_answer,
                                                                                                                    is_correct,
                                                                                                                    time_taken_seconds,
                                                                                                                    attempted_at
                                                                                                                  )
                                                                                                                VALUES (
                                                                                                                    'id:uuidINSERT INTO question_parameters (
                                                                                                                        id,
                                                                                                                        question_id,
                                                                                                                        concept_id,
                                                                                                                        difficulty,
                                                                                                                        discrimination,
                                                                                                                        guessing,
                                                                                                                        updated_at
                                                                                                                      )
                                                                                                                    VALUES (
                                                                                                                        'id:uuidINSERT INTO question_set_questions (
                                                                                                                            id,
                                                                                                                            question_set_id,
                                                                                                                            question_set_id,
                                                                                                                            question_id,
                                                                                                                            question_id,
                                                                                                                            order_position
                                                                                                                          )
                                                                                                                        VALUES (
                                                                                                                            'id:uuidINSERT INTO question_sets (
                                                                                                                                id,
                                                                                                                                title,
                                                                                                                                description,
                                                                                                                                total_questions,
                                                                                                                                time_limit_minutes,
                                                                                                                                passing_score,
                                                                                                                                is_active,
                                                                                                                                created_by,
                                                                                                                                created_at,
                                                                                                                                updated_at
                                                                                                                              )
                                                                                                                            VALUES (
                                                                                                                                'id:uuidINSERT INTO user_adaptation_preferences (
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
                                                                                                                                    'id:uuidINSERT INTO student_analytics (
                                                                                                                                        id,
                                                                                                                                        user_id,
                                                                                                                                        user_id,
                                                                                                                                        chapter,
                                                                                                                                        sub_chapter,
                                                                                                                                        total_questions_attempted,
                                                                                                                                        correct_answers,
                                                                                                                                        average_time_seconds,
                                                                                                                                        mastery_level,
                                                                                                                                        skill_radar_data,
                                                                                                                                        last_updated,
                                                                                                                                        created_at
                                                                                                                                      )
                                                                                                                                    VALUES (
                                                                                                                                        'id:uuidINSERT INTO questions (
                                                                                                                                            id,
                                                                                                                                            question_text,
                                                                                                                                            option_a,
                                                                                                                                            option_b,
                                                                                                                                            option_c,
                                                                                                                                            option_d,
                                                                                                                                            correct_answer,
                                                                                                                                            time_limit_minutes,
                                                                                                                                            subject,
                                                                                                                                            difficulty,
                                                                                                                                            created_by,
                                                                                                                                            created_at,
                                                                                                                                            updated_at,
                                                                                                                                            is_active,
                                                                                                                                            question_type,
                                                                                                                                            chapter,
                                                                                                                                            sub_chapter,
                                                                                                                                            scoring_weight,
                                                                                                                                            latex_content,
                                                                                                                                            image_url,
                                                                                                                                            explanation,
                                                                                                                                            tags,
                                                                                                                                            correct_answers,
                                                                                                                                            partial_credit,
                                                                                                                                            category_options,
                                                                                                                                            category_mapping,
                                                                                                                                            question_sections,
                                                                                                                                            tipe_soal,
                                                                                                                                            bab,
                                                                                                                                            sub_bab,
                                                                                                                                            competence,
                                                                                                                                            paket_soal,
                                                                                                                                            question_type_variant,
                                                                                                                                            irt_a_parameter,
                                                                                                                                            irt_b_parameter,
                                                                                                                                            irt_c_parameter,
                                                                                                                                            difficulty_pvalue,
                                                                                                                                            discrimination_index,
                                                                                                                                            is_valid_item,
                                                                                                                                            last_calibrated,
                                                                                                                                            level_kognitif,
                                                                                                                                            proses_berpikir
                                                                                                                                          )
                                                                                                                                        VALUES (
                                                                                                                                            'id:uuid',
                                                                                                                                            'question_text:text',
                                                                                                                                            'option_a:text',
                                                                                                                                            'option_b:text',
                                                                                                                                            'option_c:text',
                                                                                                                                            'option_d:text',
                                                                                                                                            'correct_answer:text',
                                                                                                                                            time_limit_minutes:integer,
                                                                                                                                            'subject:character varying',
                                                                                                                                            'difficulty:character varying',
                                                                                                                                            'created_by:uuid',
                                                                                                                                            'created_at:timestamp with time zone',
                                                                                                                                            'updated_at:timestamp with time zone',
                                                                                                                                            is_active:boolean,
                                                                                                                                            'question_type:character varying',
                                                                                                                                            'chapter:character varying',
                                                                                                                                            'sub_chapter:character varying',
                                                                                                                                            scoring_weight:integer,
                                                                                                                                            'latex_content:text',
                                                                                                                                            'image_url:text',
                                                                                                                                            'explanation:text',
                                                                                                                                            'tags:ARRAY',
                                                                                                                                            'correct_answers:ARRAY',
                                                                                                                                            partial_credit:boolean,
                                                                                                                                            'category_options:jsonb',
                                                                                                                                            'category_mapping:jsonb',
                                                                                                                                            'question_sections:jsonb',
                                                                                                                                            'tipe_soal:character varying',
                                                                                                                                            'bab:character varying',
                                                                                                                                            'sub_bab:character varying',
                                                                                                                                            'competence:text',
                                                                                                                                            'paket_soal:character varying',
                                                                                                                                            'question_type_variant:character varying',
                                                                                                                                            'irt_a_parameter:double precision',
                                                                                                                                            'irt_b_parameter:double precision',
                                                                                                                                            'irt_c_parameter:double precision',
                                                                                                                                            'difficulty_pvalue:double precision',
                                                                                                                                            'discrimination_index:double precision',
                                                                                                                                            is_valid_item:boolean,
                                                                                                                                            'last_calibrated:timestamp with time zone',
                                                                                                                                            'level_kognitif:text',
                                                                                                                                            'proses_berpikir:text'
                                                                                                                                          );',
                                                                                                                                        'user_id:uuid',
                                                                                                                                        'user_id:uuid',
                                                                                                                                        'chapter:text',
                                                                                                                                        'sub_chapter:text',
                                                                                                                                        total_questions_attempted:integer,
                                                                                                                                        correct_answers:integer,
                                                                                                                                        average_time_seconds:numeric,
                                                                                                                                        mastery_level:numeric,
                                                                                                                                        'skill_radar_data:jsonb',
                                                                                                                                        'last_updated:timestamp with time zone',
                                                                                                                                        'created_at:timestamp with time zone'
                                                                                                                                      );',
                                                                                                                                    'user_id:uuid',
                                                                                                                                    'user_id:uuid',
                                                                                                                                    'preferred_difficulty:jsonb',
                                                                                                                                    'learning_style:character varying',
                                                                                                                                    'pace_preference:character varying',
                                                                                                                                    'multimedia_preferences:jsonb',
                                                                                                                                    'hint_preference:character varying',
                                                                                                                                    'created_at:timestamp with time zone',
                                                                                                                                    'updated_at:timestamp with time zone'
                                                                                                                                  );',
                                                                                                                                'title:character varying',
                                                                                                                                'description:text',
                                                                                                                                total_questions:integer,
                                                                                                                                time_limit_minutes:integer,
                                                                                                                                passing_score:integer,
                                                                                                                                is_active:boolean,
                                                                                                                                'created_by:uuid',
                                                                                                                                'created_at:timestamp with time zone',
                                                                                                                                'updated_at:timestamp with time zone'
                                                                                                                              );',
                                                                                                                            'question_set_id:uuid',
                                                                                                                            'question_set_id:uuid',
                                                                                                                            'question_id:uuid',
                                                                                                                            'question_id:uuid',
                                                                                                                            order_position:integer
                                                                                                                          );',
                                                                                                                        'question_id:uuid',
                                                                                                                        'concept_id:text',
                                                                                                                        'difficulty:double precision',
                                                                                                                        'discrimination:double precision',
                                                                                                                        'guessing:double precision',
                                                                                                                        'updated_at:timestamp with time zone'
                                                                                                                      );',
                                                                                                                    'user_id:uuid',
                                                                                                                    'user_id:uuid',
                                                                                                                    'question_id:uuid',
                                                                                                                    'question_id:uuid',
                                                                                                                    'selected_answer:character',
                                                                                                                    is_correct:boolean,
                                                                                                                    time_taken_seconds:integer,
                                                                                                                    'attempted_at:timestamp with time zone'
                                                                                                                  );',
                                                                                                                'question_id:uuid',
                                                                                                                total_attempts:integer,
                                                                                                                correct_attempts:integer,
                                                                                                                average_time_seconds:numeric,
                                                                                                                difficulty_rating:numeric,
                                                                                                                discrimination_index:numeric,
                                                                                                                'created_at:timestamp with time zone',
                                                                                                                'updated_at:timestamp with time zone'
                                                                                                              );',
                                                                                                            'student_id:uuid',
                                                                                                            'student_id:uuid',
                                                                                                            'concept_id:character varying',
                                                                                                            'analytics_type:character varying',
                                                                                                            'data:jsonb',
                                                                                                            'computed_at:timestamp with time zone',
                                                                                                            'valid_until:timestamp with time zone'
                                                                                                          );',
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
                                                                                                      );',
                                                                                                    'title:character varying',
                                                                                                    'description:text',
                                                                                                    'created_at:timestamp with time zone',
                                                                                                    'updated_at:timestamp with time zone',
                                                                                                    'content:text',
                                                                                                    'chapter:character varying',
                                                                                                    'sub_chapter:character varying',
                                                                                                    'subject:character varying',
                                                                                                    'difficulty:character varying',
                                                                                                    'material_type:character varying',
                                                                                                    'tags:ARRAY',
                                                                                                    'attachment_url:text',
                                                                                                    'image_url:text',
                                                                                                    is_published:boolean,
                                                                                                    view_count:integer,
                                                                                                    'created_by:uuid',
                                                                                                    'objectives:text'
                                                                                                  );',
                                                                                                'user_id:uuid',
                                                                                                'material_id:uuid',
                                                                                                'viewed_at:timestamp with time zone',
                                                                                                view_duration_seconds:integer
                                                                                              );',
                                                                                            'material_id:uuid',
                                                                                            'material_id:uuid',
                                                                                            section_order:integer,
                                                                                            'section_type:character varying',
                                                                                            'title:character varying',
                                                                                            'content:text',
                                                                                            'metadata:jsonb',
                                                                                            'created_at:timestamp with time zone',
                                                                                            'updated_at:timestamp with time zone'
                                                                                          );',
                                                                                        'user_id:uuid',
                                                                                        'user_id:uuid',
                                                                                        'material_id:uuid',
                                                                                        'material_id:uuid',
                                                                                        is_read:boolean,
                                                                                        'read_at:timestamp with time zone',
                                                                                        time_spent_seconds:integer
                                                                                      );',
                                                                                    'student_id:uuid',
                                                                                    'content_id:uuid',
                                                                                    'session_start:timestamp with time zone',
                                                                                    'session_end:timestamp with time zone',
                                                                                    'performance_score:double precision',
                                                                                    time_spent_seconds:integer,
                                                                                    'created_at:timestamp with time zone'
                                                                                  );',
                                                                                'student_id:uuid',
                                                                                'path_name:text',
                                                                                'content_sequence:ARRAY',
                                                                                'created_at:timestamp with time zone',
                                                                                'updated_at:timestamp with time zone'
                                                                              );',
                                                                            'calibration_date:timestamp with time zone',
                                                                            total_items_calibrated:integer,
                                                                            'average_difficulty:double precision',
                                                                            'average_discrimination:double precision',
                                                                            valid_items_count:integer,
                                                                            invalid_items_count:integer,
                                                                            'calibration_details:jsonb',
                                                                            'created_at:timestamp with time zone'
                                                                          );',
                                                                        'answer_id:uuid',
                                                                        'answer_id:uuid',
                                                                        'analysis_data:jsonb',
                                                                        'created_at:timestamp with time zone',
                                                                        'updated_at:timestamp with time zone'
                                                                      );',
                                                                    'user_id:uuid',
                                                                    'question_set_id:uuid',
                                                                    'started_at:timestamp with time zone',
                                                                    'completed_at:timestamp with time zone',
                                                                    total_time_seconds:integer,
                                                                    total_score:integer,
                                                                    passing_score:integer,
                                                                    is_passed:boolean,
                                                                    'status:character varying',
                                                                    'created_at:timestamp with time zone',
                                                                    'updated_at:timestamp with time zone',
                                                                    'paket_soal:character varying',
                                                                    'question_type_variant:character varying',
                                                                    is_paused:boolean,
                                                                    'pause_started_at:timestamp with time zone'
                                                                  );',
                                                                'exam_session_id:uuid',
                                                                'question_id:uuid',
                                                                'question_id:uuid',
                                                                'selected_answer:text',
                                                                is_correct:boolean,
                                                                time_taken_seconds:integer,
                                                                'created_at:timestamp without time zone',
                                                                'answered_at:timestamp with time zone',
                                                                'user_answer:text',
                                                                is_doubtful:boolean
                                                              );',
                                                            'user_id:uuid',
                                                            'content_id:uuid',
                                                            'strategy:jsonb',
                                                            'performance_score:double precision',
                                                            'timestamp:timestamp with time zone',
                                                            'created_at:timestamp with time zone'
                                                          );',
                                                        'student_id:uuid',
                                                        'concept_id:character varying',
                                                        'mastery_level:double precision',
                                                        'performance_score:double precision',
                                                        time_spent_seconds:integer,
                                                        attempt_count:integer,
                                                        difficulty_level:integer,
                                                        'learning_velocity:double precision',
                                                        'recorded_at:timestamp with time zone',
                                                        'session_id:uuid',
                                                        'metadata:jsonb'
                                                      );',
                                                    'student_id:uuid',
                                                    'student_id:uuid',
                                                    'concept_id:character varying',
                                                    'milestone_type:character varying',
                                                    'milestone_value:double precision',
                                                    'achieved_at:timestamp with time zone',
                                                    'description:text'
                                                  );',
                                                'student_id:uuid',
                                                'student_id:uuid',
                                                'content_id:uuid',
                                                'content_id:uuid',
                                                'mastery_level:double precision',
                                                'last_updated:timestamp with time zone'
                                              );',
                                            'exam_session_id:uuid',
                                            'exam_session_id:uuid',
                                            'question_id:uuid',
                                            'question_id:uuid',
                                            'statement_text:text',
                                            selected_answer:boolean,
                                            is_correct:boolean,
                                            'created_at:timestamp with time zone',
                                            'updated_at:timestamp with time zone'
                                          );',
                                        'concept_id:text',
                                        'p_l0:double precision',
                                        'p_t:double precision',
                                        'p_g:double precision',
                                        'p_s:double precision',
                                        'updated_at:timestamp with time zone'
                                      );',
                                    'user_id:uuid',
                                    'concept_id:text',
                                    'start_time:timestamp with time zone',
                                    'end_time:timestamp with time zone',
                                    'status:text',
                                    'final_knowledge_state:double precision',
                                    'engagement_score:double precision',
                                    questions_answered:integer,
                                    'accuracy:double precision',
                                    'created_at:timestamp with time zone',
                                    'updated_at:timestamp with time zone'
                                  );',
                                'session_id:uuid',
                                'question_id:uuid',
                                'selected_answer:text',
                                is_correct:boolean,
                                time_spent:integer,
                                'knowledge_state:double precision',
                                'timestamp:timestamp with time zone'
                              );',
                            'session_id:uuid',
                            'user_id:uuid',
                            'concept_id:text',
                            'interaction_type:text',
                            'interaction_data:jsonb',
                            'timestamp:timestamp with time zone',
                            time_since_start:integer,
                            time_since_last_activity:integer
                          );',
                        'analysis_type:character varying',
                        'input_data:jsonb',
                        'output_data:jsonb',
                        confidence_score:numeric,
                        processing_time_ms:integer,
                        'created_at:timestamp with time zone'
                      );',
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
                  );',
                'admin_id:uuid',
                'action:character varying',
                'entity_type:character varying',
                'entity_id:uuid',
                'old_values:jsonb',
                'new_values:jsonb',
                'ip_address:inet',
                'user_agent:text',
                'created_at:timestamp with time zone'
              );',
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
          );',
        'title:text',
        'content:text',
        difficulty_level:integer,
        'prerequisites:ARRAY',
        'subject:character varying',
        'created_at:timestamp with time zone',
        'updated_at:timestamp with time zone'
      );',
    'user_id:uuid',
    'content_id:uuid',
    'adaptation_strategy:jsonb',
    'performance_score:double precision',
    'effectiveness_score:double precision',
    'recorded_at:timestamp with time zone'
  );