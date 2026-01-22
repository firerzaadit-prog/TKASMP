        // Import Supabase client
        import { supabase } from './clientSupabase.js';

        // Import Adaptive Learning Modules
        import { learningPathEngine, generatePersonalizedPath, getNextRecommendedContent } from './adaptive_learning_engine.js';
        import { adaptContentForStudent, calculateOptimalPacing, provideAdaptiveHints } from './content_adaptation.js';
        import { startAssessmentSession, assessUnderstanding, getNextAdaptiveQuestion, provideImmediateFeedback, calculateEngagementScore, endAssessmentSession } from './realtime_assessment.js';
        import { trackConceptProgress, getConceptMasteryLevel, identifySkillGaps, analyzeLearningCurve } from './progress_tracking.js';

        // Global variables
        let allMaterials = [];
        let currentMaterialId = null;
        let currentUserId = null;
        let adaptiveSession = null;
        let assessmentSessionId = null;
        let engagementTracking = false;
        let contentAdaptation = null;

        // Load materials and user profile on page load
        document.addEventListener('DOMContentLoaded', async () => {
            console.log('DOMContentLoaded fired, calling loadUserProfile...');

            // Immediate test to see if element exists
            const immediateTest = document.querySelector('.profile-name');
            console.log('Immediate element check:', !!immediateTest, immediateTest?.textContent);

            await loadUserProfile();
            console.log('loadUserProfile completed, calling loadMaterials...');
            await loadMaterials();

            // Test if element can be updated
            setTimeout(() => {
                const testElement = document.querySelector('.profile-name');
                console.log('Test update - element found:', !!testElement);
                if (testElement) {
                    console.log('Test update - current content:', testElement.textContent);
                    if (testElement.textContent === 'Nama Siswa') {
                        testElement.textContent = 'Test Update';
                        console.log('Test update applied');
                    }
                }
            }, 1000);
        });

        // Load materials from database
        async function loadMaterials() {
            try {

                const { data: materials, error } = await supabase
                    .from('materials')
                    .select('id, title, content, objectives, chapter, sub_chapter, subject, difficulty, material_type, tags, attachment_url, image_url, is_published, view_count, created_at, updated_at')
                    .eq('is_published', true)
                    .order('created_at', { ascending: false });

                console.log('Query result:', { materials: materials?.length, error });

                if (error) {
                    console.error('Error loading materials:', error);
                    showEmptyState('Gagal memuat materi. Silakan coba lagi.');
                    return;
                }

                // Load sections for each material
                for (const material of materials) {
                    const { data: sections, error: sectionsError } = await supabase
                        .from('material_sections')
                        .select('*')
                        .eq('material_id', material.id)
                        .order('section_order');

                    if (sectionsError) {
                        console.warn('Error loading sections for material', material.id, sectionsError);
                        material.sections = [];
                    } else {
                        material.sections = sections || [];
                    }

                    // Generate HTML content from sections for display
                    material.content = renderSectionsToHTML(material.sections);
                }

                allMaterials = materials;
                renderMaterials(materials);

            } catch (error) {
                console.error('Error in loadMaterials:', error);
                showEmptyState('Terjadi kesalahan saat memuat materi.');
            }
        }

        // Render sections to HTML for display
        function renderSectionsToHTML(sections) {
            if (!sections || sections.length === 0) {
                return 'Klik untuk melihat materi lengkap.';
            }

            let html = '';

            sections.forEach(section => {
                switch (section.section_type) {
                    case 'heading':
                        html += `<h2>${section.title}</h2>`;
                        if (section.content) {
                            html += `<p>${section.content}</p>`;
                        }
                        break;
                    case 'text':
                        if (section.title) {
                            html += `<h3>${section.title}</h3>`;
                        }
                        if (section.content) {
                            html += `<p>${section.content}</p>`;
                        }
                        break;
                    case 'list':
                        if (section.title) {
                            html += `<h3>${section.title}</h3>`;
                        }
                        if (section.content) {
                            const items = section.content.split('\n').filter(item => item.trim());
                            html += '<ul>';
                            items.forEach(item => {
                                html += `<li>${item.trim()}</li>`;
                            });
                            html += '</ul>';
                        }
                        break;
                    case 'image':
                        if (section.content) {
                            const caption = section.title ? section.title : '';
                            html += `<figure>
                                <img src="${section.content}" alt="${caption}" style="max-width: 100%; height: auto;">
                                ${caption ? `<figcaption>${caption}</figcaption>` : ''}
                            </figure>`;
                        }
                        break;
                }
            });

            return html;
        }

        // Render materials grid
        function renderMaterials(materials) {
            const grid = document.getElementById('materialsGrid');

            if (materials.length === 0) {
                showEmptyState('Belum ada materi yang tersedia.');
                return;
            }

            grid.innerHTML = materials.map(material => createMaterialCard(material)).join('');
        }

        // Create material card HTML
        function createMaterialCard(material) {
            const imageHtml = material.image_url
                ? `<img src="${material.image_url}" alt="${material.title}">`
                : `<i class="fas fa-book"></i>`;

            const shortContent = material.content
                ? material.content.replace(/<[^>]*>/g, '').substring(0, 100) + '...'
                : 'Klik untuk melihat materi lengkap.';

            return `
                <div class="material-card" onclick="showMaterialDetail('${material.id}')">
                    <div class="material-image">
                        ${imageHtml}
                    </div>
                    <div class="material-content">
                        <h3 class="material-title">${material.title}</h3>
                        <div class="material-meta">
                            <span class="material-type">${material.material_type}</span>
                            <span>${material.chapter || 'Umum'}</span>
                        </div>
                        <p class="material-description">${shortContent}</p>
                        <div class="material-stats">
                            <span><i class="fas fa-eye"></i> ${material.view_count}</span>
                            <span><i class="fas fa-clock"></i> ${material.difficulty}</span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Show material detail with adaptive content loading
        async function showMaterialDetail(materialId) {
            try {
                // Import auth functions to get current user
                const { getCurrentUser } = await import('./auth.js');
                const result = await getCurrentUser();

                if (result.success && result.user) {
                    currentUserId = result.user.id;
                }

                // Get material details
                const { data: material, error } = await supabase
                    .from('materials')
                    .select('id, title, content, objectives, chapter, sub_chapter, subject, difficulty, material_type, tags, attachment_url, image_url, is_published, view_count, created_at, updated_at')
                    .eq('id', materialId)
                    .single();

                if (error) {
                    console.error('Error loading material detail:', error);
                    return;
                }

                // Load sections for this material
                const { data: sections, error: sectionsError } = await supabase
                    .from('material_sections')
                    .select('*')
                    .eq('material_id', materialId)
                    .order('section_order');

                if (sectionsError) {
                    console.warn('Error loading sections for material detail:', sectionsError);
                    material.sections = [];
                } else {
                    material.sections = sections || [];
                }

                // Update global view count
                await supabase.rpc('increment_material_views', { material_uuid: materialId });

                // Record user-specific material view if user is logged in
                if (result.success && result.user) {
                    try {
                        await supabase.rpc('record_material_view', {
                            p_user_id: result.user.id,
                            p_material_id: materialId,
                            p_duration: 0
                        });
                        console.log('Material view recorded for user:', result.user.id);
                    } catch (viewError) {
                        console.warn('Failed to record material view:', viewError);
                        // Don't fail the whole operation if view recording fails
                    }
                }

                // Initialize adaptive learning for this material
                if (currentUserId) {
                    await initializeAdaptiveLearning(materialId, material);
                }

                // Render material detail with adaptive features
                renderMaterialDetail(material);

                // Hide grid, show detail
                document.getElementById('materialsGrid').style.display = 'none';
                document.querySelector('.filters').style.display = 'none';
                document.getElementById('materialDetail').classList.add('active');

                currentMaterialId = materialId;

                // Start engagement tracking
                if (currentUserId) {
                    startEngagementTracking();
                }

            } catch (error) {
                console.error('Error in showMaterialDetail:', error);
            }
        }

        // Render material detail with adaptive content
        function renderMaterialDetail(material) {
            const detailContent = document.getElementById('materialDetailContent');

            const imageHtml = material.image_url
                ? `<img src="${material.image_url}" alt="${material.title}" style="max-width: 100%; height: auto; border-radius: 8px; margin-bottom: 2rem;">`
                : '';

            const attachmentHtml = material.attachment_url
                ? `<div style="margin-top: 2rem; padding: 1rem; background: #f8fafc; border-radius: 8px;">
                    <h4><i class="fas fa-paperclip"></i> Lampiran</h4>
                    <a href="${material.attachment_url}" style="color: #4f46e5; text-decoration: none;">
                        <i class="fas fa-eye"></i> Lihat File
                    </a>
                   </div>`
                : '';

            // Apply content adaptation if available
            let adaptedSections = material.sections;
            if (contentAdaptation && contentAdaptation.adaptedContent) {
                adaptedSections = applyContentAdaptationToSections(material.sections, contentAdaptation);
            }

            // Render sections for detail view
            const sectionsHtml = renderSectionsForDetail(adaptedSections);

            // Show objectives if they exist
            const objectivesHtml = material.objectives ? `
                <div class="objectives-section" style="margin-bottom: 2rem; padding: 1.5rem; background: #f8fafc; border-radius: 8px; border-left: 4px solid #4f46e5;">
                    <h3 style="color: #1f2937; margin-bottom: 1rem;"><i class="fas fa-bullseye"></i> Tujuan Pembelajaran</h3>
                    <p style="margin: 0; line-height: 1.6; color: #374151;">${material.objectives}</p>
                </div>
            ` : '';

            // Add adaptive hints if needed
            const hintsHtml = contentAdaptation && contentAdaptation.adaptationStrategy?.support === 'high' ?
                `<div class="adaptive-hints" style="margin-bottom: 2rem; padding: 1rem; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                    <h4 style="color: #92400e; margin-bottom: 0.5rem;"><i class="fas fa-lightbulb"></i> Bantuan Pembelajaran</h4>
                    <p style="margin: 0; color: #78350f;">Konten ini telah disesuaikan dengan level pemahaman Anda. Jika mengalami kesulitan, gunakan tombol "Petunjuk" pada assessment.</p>
                </div>` : '';

            detailContent.innerHTML = `
                <div class="detail-header">
                    <div>
                        <h1 class="detail-title">${material.title}</h1>
                        <div class="detail-meta">
                            <span><i class="fas fa-tag"></i> ${material.material_type}</span>
                            <span><i class="fas fa-book"></i> ${material.chapter || 'Umum'}</span>
                            <span><i class="fas fa-chart-line"></i> ${getAdaptedDifficultyLabel(material.difficulty)}</span>
                            <span><i class="fas fa-eye"></i> ${material.view_count + 1} dilihat</span>
                            ${contentAdaptation ? `<span><i class="fas fa-brain"></i> Adaptif: ${contentAdaptation.adaptationStrategy?.difficulty || 'auto'}</span>` : ''}
                        </div>
                    </div>
                </div>

                ${imageHtml}

                ${hintsHtml}

                ${objectivesHtml}

                <div class="detail-content">
                    ${sectionsHtml}
                </div>

                ${attachmentHtml}
            `;
        }

        // Render sections for detail view
        function renderSectionsForDetail(sections) {
            if (!sections || sections.length === 0) {
                return '';
            }

            let html = '';

            sections.forEach(section => {
                switch (section.section_type) {
                    case 'heading':
                        html += `<h2 style="color: #1f2937; margin-top: 2rem; margin-bottom: 1rem; font-weight: 600;">${section.title}</h2>`;
                        if (section.content) {
                            html += `<p style="margin-bottom: 1rem; line-height: 1.7;">${section.content}</p>`;
                        }
                        break;
                    case 'text':
                        if (section.title) {
                            html += `<h3 style="color: #1f2937; margin-top: 1.5rem; margin-bottom: 0.5rem; font-weight: 600;">${section.title}</h3>`;
                        }
                        if (section.content) {
                            html += `<p style="margin-bottom: 1rem; line-height: 1.7;">${section.content}</p>`;
                        }
                        break;
                    case 'list':
                        if (section.title) {
                            html += `<h3 style="color: #1f2937; margin-top: 1.5rem; margin-bottom: 0.5rem; font-weight: 600;">${section.title}</h3>`;
                        }
                        if (section.content) {
                            const items = section.content.split('\n').filter(item => item.trim());
                            html += '<ul style="margin-left: 1.5rem; margin-bottom: 1rem;">';
                            items.forEach(item => {
                                html += `<li style="margin-bottom: 0.5rem;">${item.trim()}</li>`;
                            });
                            html += '</ul>';
                        }
                        break;
                    case 'image':
                        if (section.content) {
                            const caption = section.title ? section.title : '';
                            html += `<figure style="margin: 2rem 0; text-align: center;">
                                <img src="${section.content}" alt="${caption}" style="max-width: 100%; height: auto; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                                ${caption ? `<figcaption style="margin-top: 0.5rem; font-style: italic; color: #6b7280;">${caption}</figcaption>` : ''}
                            </figure>`;
                        }
                        break;
                }
            });

            return html;
        }

        // Show materials list
        function showMaterialsList() {
            // Stop engagement tracking and assessment
            stopEngagementTracking();
            if (assessmentSessionId) {
                endCurrentAssessment();
            }

            document.getElementById('materialsGrid').style.display = 'grid';
            document.querySelector('.filters').style.display = 'flex';
            document.getElementById('materialDetail').classList.remove('active');
            currentMaterialId = null;
            currentUserId = null;
            contentAdaptation = null;
        }

        // Filter materials
        function filterMaterials() {
            const subject = document.getElementById('subjectFilter').value;
            const chapter = document.getElementById('chapterFilter').value;
            const type = document.getElementById('typeFilter').value;
            const difficulty = document.getElementById('difficultyFilter').value;

            let filteredMaterials = allMaterials.filter(material => {
                if (subject && material.subject !== subject) return false;
                if (chapter && material.chapter !== chapter) return false;
                if (type && material.material_type !== type) return false;
                if (difficulty && material.difficulty !== difficulty) return false;
                return true;
            });

            renderMaterials(filteredMaterials);
        }

        // Show empty state
        function showEmptyState(message) {
            const grid = document.getElementById('materialsGrid');
            grid.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-book-open"></i>
                    <p>${message}</p>
                </div>
            `;
        }

        // ==========================================
        // ADAPTIVE LEARNING FUNCTIONS
        // ==========================================

        // Initialize adaptive learning for material
        async function initializeAdaptiveLearning(materialId, material) {
            try {
                console.log('Initializing adaptive learning for material:', materialId);

                // Get current mastery level
                const masteryData = await getConceptMasteryLevel(currentUserId, materialId);
                updateMasteryDisplay(masteryData);

                // Adapt content for student
                const recentPerformance = await getRecentPerformance(currentUserId, materialId);
                contentAdaptation = await adaptContentForStudent(currentUserId, materialId, recentPerformance);

                // Load personalized learning path
                await loadPersonalizedPath();

                // Load skill gaps
                await loadSkillGaps();

                console.log('Adaptive learning initialized successfully');

            } catch (error) {
                console.error('Error initializing adaptive learning:', error);
            }
        }

        // Start engagement tracking
        function startEngagementTracking() {
            if (engagementTracking) return;

            engagementTracking = true;
            document.getElementById('engagementOverlay').style.display = 'block';

            // Track engagement periodically
            setInterval(async () => {
                if (currentUserId && assessmentSessionId) {
                    const engagement = await calculateEngagementScore(currentUserId);
                    updateEngagementDisplay(engagement);
                }
            }, 30000); // Every 30 seconds

            console.log('Engagement tracking started');
        }

        // Stop engagement tracking
        function stopEngagementTracking() {
            engagementTracking = false;
            document.getElementById('engagementOverlay').style.display = 'none';
        }

        // Update mastery display
        function updateMasteryDisplay(masteryData) {
            if (!masteryData) return;

            const masteryPercent = Math.round(masteryData.masteryLevel * 100);
            document.getElementById('masteryLevel').textContent = `Mastery: ${masteryPercent}%`;
            document.getElementById('masteryProgress').style.width = `${masteryPercent}%`;
        }

        // Update engagement display
        function updateEngagementDisplay(engagement) {
            if (!engagement) return;

            const engagementPercent = Math.round(engagement.score * 100);
            document.getElementById('engagementScore').textContent = `Engagement: ${engagementPercent}%`;
        }

        // Load personalized learning path
        async function loadPersonalizedPath() {
            try {
                const path = await generatePersonalizedPath(currentUserId);
                renderLearningPath(path);
            } catch (error) {
                console.error('Error loading personalized path:', error);
            }
        }

        // Render learning path recommendations
        function renderLearningPath(path) {
            const recommendationsDiv = document.getElementById('nextRecommendations');

            if (!path || !path.path || path.path.length === 0) {
                recommendationsDiv.innerHTML = '<p>Tidak ada rekomendasi tersedia</p>';
                return;
            }

            const html = path.path.slice(0, 3).map(item => `
                <div class="recommendation-item" onclick="navigateToMaterial('${item.id}')">
                    <div class="recommendation-content">
                        <h5>${item.name}</h5>
                        <span class="difficulty-badge difficulty-${item.difficulty}">${getDifficultyLabel(item.difficulty)}</span>
                    </div>
                    <i class="fas fa-arrow-right"></i>
                </div>
            `).join('');

            recommendationsDiv.innerHTML = html;
        }

        // Load and display skill gaps
        async function loadSkillGaps() {
            try {
                const skillGaps = await identifySkillGaps(currentUserId);
                // Skill gaps are used internally for path generation
                console.log('Skill gaps identified:', skillGaps.length);
            } catch (error) {
                console.error('Error loading skill gaps:', error);
            }
        }

        // Get recent performance for content adaptation
        async function getRecentPerformance(userId, materialId) {
            try {
                const curve = await analyzeLearningCurve(userId, materialId, { days: 7 });
                return curve && curve.dataPoints > 0 ?
                    curve.curveData[curve.curveData.length - 1]?.performance || 0.5 : 0.5;
            } catch (error) {
                console.warn('Error getting recent performance:', error);
                return 0.5; // Default moderate performance
            }
        }

        // Adjust difficulty based on user selection
        async function adjustDifficulty() {
            const difficulty = document.getElementById('difficultyControl').value;
            if (difficulty === 'auto' || !contentAdaptation) return;

            // Apply manual difficulty adjustment
            const newAdaptation = { ...contentAdaptation.adaptationStrategy, difficulty };
            await applyContentAdaptation(currentMaterialId, newAdaptation);
        }

        // Adjust pace based on user selection
        async function adjustPace() {
            const pace = document.getElementById('paceControl').value;
            if (pace === 'auto' || !currentUserId) return;

            // Calculate optimal pacing
            const pacing = await calculateOptimalPacing(currentUserId, 'text');
            console.log('Pacing adjusted to:', pace, pacing);
        }

        // Start assessment session
        async function startAssessment() {
            if (!currentUserId || !currentMaterialId) return;

            try {
                assessmentSessionId = await startAssessmentSession(currentUserId, currentMaterialId);
                document.getElementById('assessmentPanel').style.display = 'block';

                // Load first question
                await loadNextAssessmentQuestion();

            } catch (error) {
                console.error('Error starting assessment:', error);
                alert('Gagal memulai assessment. Silakan coba lagi.');
            }
        }

        // Load next assessment question
        async function loadNextAssessmentQuestion() {
            if (!assessmentSessionId) return;

            try {
                const questionData = await getNextAdaptiveQuestion(currentUserId, currentMaterialId);

                if (!questionData) {
                    // No more questions, end assessment
                    await endCurrentAssessment();
                    return;
                }

                renderAssessmentQuestion(questionData);

            } catch (error) {
                console.error('Error loading next question:', error);
            }
        }

        // Render assessment question
        function renderAssessmentQuestion(questionData) {
            const assessmentContent = document.getElementById('assessmentContent');

            const question = questionData.question;
            const html = `
                <div class="assessment-question">
                    <h4>${question.question_text}</h4>
                    <div class="question-options">
                        ${renderQuestionOptions(question)}
                    </div>
                    <div class="question-actions">
                        <button class="btn-primary" onclick="submitAssessmentAnswer()">
                            <i class="fas fa-check"></i> Jawab
                        </button>
                        <button class="btn-secondary" onclick="requestHint()">
                            <i class="fas fa-lightbulb"></i> Petunjuk
                        </button>
                    </div>
                    <div id="feedbackArea" class="feedback-area"></div>
                </div>
            `;

            assessmentContent.innerHTML = html;
        }

        // Render question options based on type
        function renderQuestionOptions(question) {
            if (question.question_type === 'Pilihan Ganda') {
                return question.options.map((option, index) => `
                    <label class="option-item">
                        <input type="radio" name="assessment_answer" value="${option}" required>
                        <span>${option}</span>
                    </label>
                `).join('');
            } else if (question.question_type === 'PGK MCMA') {
                return question.options.map((option, index) => `
                    <label class="option-item">
                        <input type="checkbox" name="assessment_answer" value="${option}">
                        <span>${option}</span>
                    </label>
                `).join('');
            }

            return '<p>Tipe soal tidak didukung</p>';
        }

        // Submit assessment answer
        async function submitAssessmentAnswer() {
            const selectedInputs = document.querySelectorAll('input[name="assessment_answer"]:checked');
            if (selectedInputs.length === 0) {
                alert('Silakan pilih jawaban terlebih dahulu');
                return;
            }

            const selectedAnswer = Array.from(selectedInputs).map(input => input.value);
            const answerString = selectedAnswer.join(',');

            try {
                // Assess understanding
                const assessment = await assessUnderstanding(currentUserId, currentMaterialId, {
                    questionId: document.querySelector('.assessment-question').dataset.questionId,
                    selectedAnswer: answerString,
                    timeSpent: 30 // Simplified time tracking
                });

                // Provide immediate feedback
                const feedback = provideImmediateFeedback(currentUserId, assessment.questionId, answerString);
                displayFeedback(feedback);

                // Update progress
                await trackConceptProgress(currentUserId, currentMaterialId, {
                    performanceScore: assessment.performance,
                    timeSpentSeconds: 30,
                    difficultyLevel: 3,
                    sessionId: assessmentSessionId
                });

                // Update displays
                updateMasteryDisplay(await getConceptMasteryLevel(currentUserId, currentMaterialId));

                // Load next question after delay
                setTimeout(() => {
                    loadNextAssessmentQuestion();
                }, 3000);

            } catch (error) {
                console.error('Error submitting answer:', error);
            }
        }

        // Display feedback
        function displayFeedback(feedback) {
            const feedbackArea = document.getElementById('feedbackArea');
            const feedbackClass = feedback.isCorrect ? 'feedback-correct' : 'feedback-incorrect';

            feedbackArea.innerHTML = `
                <div class="feedback-message ${feedbackClass}">
                    <h5>${feedback.isCorrect ? 'Benar!' : 'Belum Tepat'}</h5>
                    <p>${feedback.message}</p>
                    ${feedback.hint ? `<p class="hint"><strong>Petunjuk:</strong> ${feedback.hint}</p>` : ''}
                    ${feedback.nextSteps.length > 0 ? `
                        <div class="next-steps">
                            <strong>Selanjutnya:</strong>
                            <ul>${feedback.nextSteps.map(step => `<li>${step}</li>`).join('')}</ul>
                        </div>
                    ` : ''}
                </div>
            `;
        }

        // Request hint
        async function requestHint() {
            if (!currentUserId || !currentMaterialId) return;

            try {
                const struggleLevel = 0.7; // Assume moderate struggle
                const hints = await provideAdaptiveHints(currentUserId, currentMaterialId, struggleLevel);

                if (hints.hints && hints.hints.length > 0) {
                    const feedbackArea = document.getElementById('feedbackArea');
                    feedbackArea.innerHTML = `
                        <div class="feedback-hint">
                            <h5>Petunjuk:</h5>
                            <p>${hints.hints[0].content}</p>
                        </div>
                    `;
                }

            } catch (error) {
                console.error('Error requesting hint:', error);
            }
        }

        // End current assessment
        async function endCurrentAssessment() {
            if (!assessmentSessionId) return;

            try {
                const summary = await endAssessmentSession(assessmentSessionId);
                assessmentSessionId = null;

                // Show completion message
                const assessmentContent = document.getElementById('assessmentContent');
                assessmentContent.innerHTML = `
                    <div class="assessment-complete">
                        <h4><i class="fas fa-trophy"></i> Assessment Selesai!</h4>
                        <div class="assessment-summary">
                            <p>Waktu: ${Math.round(summary.duration / 1000 / 60)} menit</p>
                            <p>Akurasi: ${Math.round(summary.accuracy * 100)}%</p>
                            <p>Mastery Akhir: ${Math.round(summary.finalKnowledge * 100)}%</p>
                        </div>
                        <button class="btn-primary" onclick="closeAssessmentPanel()">
                            <i class="fas fa-times"></i> Tutup
                        </button>
                    </div>
                `;

            } catch (error) {
                console.error('Error ending assessment:', error);
            }
        }

        // Close assessment panel
        function closeAssessmentPanel() {
            document.getElementById('assessmentPanel').style.display = 'none';
            if (assessmentSessionId) {
                endCurrentAssessment();
            }
        }

        // Show skill gaps
        async function showSkillGaps() {
            try {
                const skillGaps = await identifySkillGaps(currentUserId);

                if (skillGaps.length === 0) {
                    alert('Tidak ada kekurangan keterampilan yang terdeteksi. Bagus!');
                    return;
                }

                const gapsText = skillGaps.map(gap =>
                    `${gap.conceptId}: ${Math.round(gap.currentMastery * 100)}% mastery`
                ).join('\n');

                alert(`Kekurangan Keterampilan:\n\n${gapsText}\n\nFokus pada konsep-konsep ini untuk meningkatkan pemahaman.`);

            } catch (error) {
                console.error('Error showing skill gaps:', error);
            }
        }

        // Navigate to recommended material
        function navigateToMaterial(materialId) {
            showMaterialDetail(materialId);
        }

        // Utility functions
        function getDifficultyLabel(difficulty) {
            const labels = { 1: 'Mudah', 2: 'Mudah', 3: 'Sedang', 4: 'Sulit', 5: 'Sangat Sulit' };
            return labels[difficulty] || 'Sedang';
        }

        function getAdaptedDifficultyLabel(baseDifficulty) {
            if (!contentAdaptation) return getDifficultyLabel(baseDifficulty);

            const adapted = contentAdaptation.adaptationStrategy?.difficulty;
            if (adapted === 'easier') return 'Disederhanakan';
            if (adapted === 'harder') return 'Diperdalam';
            return getDifficultyLabel(baseDifficulty);
        }

        // Apply content adaptation to sections
        function applyContentAdaptationToSections(sections, adaptation) {
            if (!adaptation || !adaptation.adaptationStrategy) return sections;

            return sections.map(section => {
                const adaptedSection = { ...section };

                // Apply text adaptation
                if (adaptation.adaptationStrategy.difficulty === 'easier' && section.section_type === 'text') {
                    adaptedSection.content = simplifyText(section.content);
                } else if (adaptation.adaptationStrategy.difficulty === 'harder' && section.section_type === 'text') {
                    adaptedSection.content = enhanceText(section.content);
                }

                return adaptedSection;
            });
        }

        // Simple text simplification (placeholder - in real implementation, use NLP)
        function simplifyText(text) {
            return text
                .replace(/(\w+)(\s+)(and|or|but|so|because|although|however)(\s+)/gi, '$1. ')
                .replace(/\b(?:furthermore|moreover|additionally|consequently|subsequently)\b/gi, 'Also');
        }

        // Simple text enhancement (placeholder - in real implementation, use NLP)
        function enhanceText(text) {
            return text
                .replace(/\b(example|for instance)\b/gi, 'For example')
                .replace(/\b(important|key|crucial)\b/gi, 'Very important');
        }

        // ==========================================
        // GLOBAL FUNCTION EXPORTS
        // ==========================================

        // Make functions global
        window.showMaterialDetail = showMaterialDetail;
        window.showMaterialsList = showMaterialsList;
        window.filterMaterials = filterMaterials;
        window.adjustDifficulty = adjustDifficulty;
        window.adjustPace = adjustPace;
        window.startAssessment = startAssessment;
        window.submitAssessmentAnswer = submitAssessmentAnswer;
        window.requestHint = requestHint;
        window.closeAssessmentPanel = closeAssessmentPanel;
        window.showSkillGaps = showSkillGaps;
        window.navigateToMaterial = navigateToMaterial;

        // Load user profile information (same as halamanpertama.html)
        async function loadUserProfile() {
            console.log('loadUserProfile function called');
            try {
                // Import auth functions
                console.log('About to import auth.js...');
                const { getCurrentUser } = await import('./auth.js');
                console.log('auth.js imported successfully');

                console.log('About to call getCurrentUser...');
                const result = await getCurrentUser();
                console.log('getCurrentUser result:', result);

                if (!result.success || !result.user) {
                    console.log('User not logged in, but continuing without redirect for debugging');
                    // alert('Anda belum login. Mengarahkan ke halaman login...');
                    // window.location.href = 'index.html';
                    // return;
                    // For debugging, continue and set a default name
                    const profileName = document.querySelector('.profile-name');
                    if (profileName) {
                        profileName.textContent = 'Tamu';
                        console.log('Set name to Tamu (guest)');
                    }
                    return;
                }

                // Get user profile data from Supabase - prioritize database data
                let profileData = null;
                try {
                    // Try to get existing profile
                    const { data, error } = await supabase
                        .from('profiles')
                        .select('nama_lengkap, email, avatar_url')
                        .eq('id', result.user.id)
                        .single();

                    if (error && error.code === 'PGRST116') {
                        // Profile doesn't exist, create it with available data
                        console.log('Creating new user profile...');
                        const userName = result.user.user_metadata?.full_name ||
                                        result.user.user_metadata?.name ||
                                        (result.user.email ? result.user.email.split('@')[0] : null) ||
                                        'Siswa';

                        const { data: newProfile, error: createError } = await supabase
                            .from('profiles')
                            .insert({
                                id: result.user.id,
                                nama_lengkap: userName,
                                email: result.user.email
                            })
                            .select('nama_lengkap, email, avatar_url')
                            .single();

                        if (createError) {
                            console.error('Error creating profile:', createError);
                            // Continue with auth data only
                        } else {
                            profileData = newProfile;
                            console.log('Profile created successfully:', profileData);
                        }
                    } else if (error) {
                        console.error('Error fetching profile:', error);
                        // Continue with auth data only
                    } else {
                        profileData = data;
                        console.log('Profile loaded from database:', profileData);

                        // If profile exists but nama_lengkap is empty, try to update it
                        if (!profileData.nama_lengkap || profileData.nama_lengkap.trim() === '') {
                            console.log('Profile exists but nama_lengkap is empty, trying to update...');
                            const userName = result.user.user_metadata?.full_name ||
                                            result.user.user_metadata?.name ||
                                            (result.user.email ? result.user.email.split('@')[0] : null) ||
                                            'Siswa';

                            if (userName && userName !== 'Siswa') {
                                const { error: updateError } = await supabase
                                    .from('profiles')
                                    .update({ nama_lengkap: userName })
                                    .eq('id', result.user.id);

                                if (!updateError) {
                                    profileData.nama_lengkap = userName;
                                    console.log('Profile nama_lengkap updated:', userName);
                                } else {
                                    console.error('Failed to update nama_lengkap:', updateError);
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error('Profile operation error:', err);
                    // Continue with auth data only
                }

                // Determine display name - prioritize database profile data
                let displayName = 'Siswa'; // Default fallback

                if (profileData?.nama_lengkap && profileData.nama_lengkap.trim()) {
                    displayName = profileData.nama_lengkap.trim();
                    console.log('Using nama_lengkap from profile:', displayName);
                } else if (result.user.user_metadata?.full_name && result.user.user_metadata.full_name.trim()) {
                    displayName = result.user.user_metadata.full_name.trim();
                    console.log('Using full_name from user_metadata:', displayName);
                } else if (result.user.user_metadata?.name && result.user.user_metadata.name.trim()) {
                    displayName = result.user.user_metadata.name.trim();
                    console.log('Using name from user_metadata:', displayName);
                } else if (result.user.email) {
                    displayName = result.user.email.split('@')[0];
                    console.log('Using email prefix:', displayName);
                }

                console.log('Final displayName:', displayName);

                console.log('Calculated displayName:', displayName);
                console.log('User data for display:', {
                    displayName,
                    profileData_nama_lengkap: profileData?.nama_lengkap,
                    user_metadata_full_name: result.user.user_metadata?.full_name,
                    user_metadata_name: result.user.user_metadata?.name,
                    email_part: result.user.email ? result.user.email.split('@')[0] : null,
                    authUser: result.user,
                    profileData,
                    userMetadata: result.user?.user_metadata,
                    authEmail: result.user?.email
                });

                // Update header profile section
                const profileName = document.querySelector('.profile-name');
                console.log('Looking for .profile-name element:', profileName);
                if (profileName) {
                    profileName.textContent = displayName;
                    console.log('Updated header profile name to:', displayName);
                    console.log('Element content after update:', profileName.textContent);
                } else {
                    console.error('Header profile name element not found');
                    console.log('All elements with class profile-name:', document.querySelectorAll('.profile-name'));
                }

                // Update header profile avatar
                const profileAvatar = document.querySelector('.profile-avatar');
                if (profileAvatar) {
                    if (profileData?.avatar_url) {
                        profileAvatar.src = profileData.avatar_url;
                    } else {
                        const firstLetter = displayName.charAt(0).toUpperCase();
                        profileAvatar.src = `data:image/svg+xml;base64,${btoa(`<svg width="40" height="40" xmlns="http://www.w3.org/2000/svg"><rect width="40" height="40" fill="#4F46E5"/><text x="20" y="25" font-family="Arial" font-size="16" fill="white" text-anchor="middle">${firstLetter}</text></svg>`)}`;
                    }
                    profileAvatar.alt = `Avatar ${displayName}`;
                    console.log('Updated header profile avatar');
                } else {
                    console.error('Header profile avatar element not found');
                }

                console.log('User info displayed successfully:', {
                    user: result.user,
                    profile: profileData,
                    displayName
                });

            } catch (error) {
                console.error('Error loading user info:', error);
                // Don't redirect immediately, try to show a default name
                console.log('Error occurred, trying to set default name...');
                const profileName = document.querySelector('.profile-name');
                if (profileName && profileName.textContent === 'Nama Siswa') {
                    profileName.textContent = 'Siswa';
                    console.log('Set default name to Siswa');
                }
                // alert('Terjadi kesalahan saat memuat data pengguna.');
                // window.location.href = 'index.html';
            }
        }

        // Navbar functions (same as halamanpertama.html)
        function showRecentActivities() {
            alert('Fitur Aktivitas Terakhir sedang dalam pengembangan.');
        }

        // Start exam function
        function startExam() {
            if (confirm('Apakah Anda yakin ingin memulai ujian TKA Matematika? Pastikan koneksi internet stabil dan waktu cukup.')) {
                window.location.href = 'ujian.html';
            }
        }

        // Show profile modal
        function showProfileModal() {
            const modal = document.getElementById('profileModal');
            if (modal) {
                modal.classList.add('show');
                loadProfileData();
            }
        }

        // Hide profile modal
        function hideProfileModal() {
            const modal = document.getElementById('profileModal');
            if (modal) {
                modal.classList.remove('show');
            }
        }

        // Logout function for global access
        async function performLogout() {
            if (confirm('Apakah Anda ingin logout?')) {
                try {
                    // Import logout function
                    const { logout } = await import('./auth.js');
                    await logout();
                    alert('Logout berhasil!');
                    window.location.href = 'index.html';
                } catch (error) {
                    console.error('Logout error:', error);
                    alert('Logout gagal: ' + error.message);
                }
            }
        }

        // Load profile data
        async function loadProfileData() {
            try {
                // Import auth functions
                const { getCurrentUser } = await import('./auth.js');

                const result = await getCurrentUser();
                if (!result.success || !result.user) {
                    alert('Anda harus login terlebih dahulu!');
                    return;
                }

                const userId = result.user.id;
                console.log('Loading profile for user:', userId);

                // Load profile data
                const { data: profile, error } = await supabase
                    .from('profiles')
                    .select('id, nama_lengkap, email, phone, school, bio, avatar_url, created_at, updated_at')
                    .eq('id', userId)
                    .single();

                if (error && error.code !== 'PGRST116') {
                    console.error('Error loading profile:', error);
                    alert('Gagal memuat data profil: ' + error.message);
                    return;
                }

                console.log('Profile data loaded:', profile);
                currentProfileData = profile || {};

                // Populate form fields
                populateProfileForm(result.user, currentProfileData);

                // Load account statistics
                await loadAccountStatistics(userId);

                // Load settings
                loadUserSettings();

            } catch (error) {
                console.error('Error in loadProfileData:', error);
                alert('Terjadi kesalahan saat memuat data profil.');
            }
        }

        // Populate profile form
        function populateProfileForm(user, profile) {
            // Basic info
            document.getElementById('profileFullName').value = profile.nama_lengkap || user.user_metadata?.full_name || user.user_metadata?.name || '';
            document.getElementById('profileEmail').value = profile.email || user.email || '';

            // Additional info
            document.getElementById('profilePhone').value = profile.phone || '';
            document.getElementById('profileSchool').value = profile.school || '';
            document.getElementById('profileBio').value = profile.bio || '';

            // Profile image
            const avatarUrl = profile.avatar_url || user.user_metadata?.avatar_url;
            const profileImage = document.getElementById('currentProfileImage');
            if (avatarUrl) {
                profileImage.src = avatarUrl;
            } else {
                // Generate avatar from name
                const displayName = profile.nama_lengkap || user.user_metadata?.full_name || user.email?.split('@')[0] || 'U';
                const firstLetter = displayName.charAt(0).toUpperCase();
                profileImage.src = `data:image/svg+xml;base64,${btoa(`<svg width="120" height="120" xmlns="http://www.w3.org/2000/svg"><rect width="120" height="120" fill="#4F46E5"/><text x="60" y="75" font-family="Arial" font-size="48" fill="white" text-anchor="middle">${firstLetter}</text></svg>`)}`;
            }
        }

        // Load account statistics
        async function loadAccountStatistics(userId) {
            try {
                // Get user creation date
                const { data: authUser } = await supabase.auth.getUser();
                if (authUser.user) {
                    const joinDate = new Date(authUser.user.created_at).toLocaleDateString('id-ID');
                    document.getElementById('joinDate').textContent = joinDate;
                }

                // Load analytics data
                const { data: analytics, error: analyticsError } = await supabase
                    .from('student_analytics')
                    .select('*')
                    .eq('user_id', userId);

                if (!analyticsError && analytics) {
                    const totalMaterials = analytics.length;
                    const totalTime = analytics.reduce((sum, a) => sum + (a.average_time_seconds || 0), 0) / 3600;
                    const avgScore = analytics.length > 0
                        ? Math.round(analytics.reduce((sum, a) => sum + (a.mastery_level || 0), 0) / analytics.length * 100)
                        : 0;

                    document.getElementById('totalStudyTimeStat').textContent = `${Math.round(totalTime)} jam`;
                    document.getElementById('materialsCompletedStat').textContent = totalMaterials;
                    document.getElementById('averageScoreStat').textContent = `${avgScore}%`;
                }

                // Load exam attempts
                const { data: exams, error: examsError } = await supabase
                    .from('exam_sessions')
                    .select('id')
                    .eq('user_id', userId);

                if (!examsError && exams) {
                    document.getElementById('examsTakenStat').textContent = exams.length;
                }

            } catch (error) {
                console.error('Error loading account statistics:', error);
            }
        }

        // Load user settings
        function loadUserSettings() {
            // Load settings from localStorage
            const emailNotifications = localStorage.getItem('emailNotifications') !== 'false'; // Default true
            const darkMode = localStorage.getItem('darkMode') === 'true'; // Default false

            document.getElementById('emailNotifications').checked = emailNotifications;
            document.getElementById('darkMode').checked = darkMode;
        }

        // Global variables for profile modal
        let currentProfileData = null;

        // Event listeners for profile modal
        document.addEventListener('DOMContentLoaded', () => {
            // Modal close functionality
            const modal = document.getElementById('profileModal');
            if (modal) {
                modal.addEventListener('click', (e) => {
                    if (e.target === modal || e.target.classList.contains('modal-close')) {
                        hideProfileModal();
                    }
                });

                // Close on Escape key
                document.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape' && modal.classList.contains('show')) {
                        hideProfileModal();
                    }
                });
            }
        });

        // Export functions for global access (same as halamanpertama.html)
        window.showProfileModal = showProfileModal;
        window.hideProfileModal = hideProfileModal;
        window.logout = performLogout;
        window.showRecentActivities = showRecentActivities;
        window.startExam = startExam;
