// ============================================================================
// ENHANCEMENT: TAMPILKAN ANALISIS AI DI ADMIN PANEL (VERSI DESIGN PREMIUM V4)
// ============================================================================

import { supabase } from './clientSupabase.js';

let activeRadarChart = null;

// Escape teks dari AI sebelum disuntik ke innerHTML
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ----------------------------------------------------------------------------
// 1. DATA FETCHING (LOGIKA V3 STABIL - JANGAN DIUBAH)
// ----------------------------------------------------------------------------
async function getStudentAIAnalysis(userId) {
    try {
        // Ambil data dari student_analytics
        const { data: analyticsData, error } = await supabase
            .from('student_analytics')
            .select('*')
            .eq('user_id', userId)
            .order('last_updated', { ascending: false })
            .limit(1);

        if (error || !analyticsData || analyticsData.length === 0) {
            console.warn("Data analytics tidak ditemukan.");
            throw new Error("Data siswa belum tersedia.");
        }

        const studentData = analyticsData[0];
        
        // Deteksi kolom AI (fallback lama, dipakai kalau belum ada analisis per-topik)
        const aiText = studentData.ai_summary || studentData.analysis_result || studentData.notes || null;

        // ── Ambil analisis AI per-topik dari sesi ujian terakhir ──────────
        // Data hasil Gemini yang sebenarnya ada di tabel gemini_analyses,
        // dikaitkan lewat exam_sessions.id (bukan lewat student_analytics).
        let topics = [];
        try {
            const { data: sessions } = await supabase
                .from('exam_sessions')
                .select('id')
                .eq('user_id', userId)
                .eq('status', 'completed')
                .order('created_at', { ascending: false })
                .limit(1);

            const latestSessionId = sessions && sessions[0]?.id;
            if (latestSessionId) {
                const { data: geminiRecord } = await supabase
                    .from('gemini_analyses')
                    .select('analysis_data')
                    .eq('answer_id', latestSessionId)
                    .maybeSingle();

                if (Array.isArray(geminiRecord?.analysis_data?.topics)) {
                    topics = geminiRecord.analysis_data.topics.filter(t => t && t.topik);
                }
            }
        } catch (topicErr) {
            console.warn('Gagal mengambil analisis per-topik:', topicErr);
        }

        return {
            user: {
                id: userId,
                nama: studentData.nama_lengkap || studentData.nama || "Siswa",
                kelas: studentData.kelas || "-",
                last_exam: new Date(studentData.last_updated).toLocaleDateString('id-ID')
            },
            stats: {
                avg: Math.round(studentData.average_score || 0),
                high: studentData.highest_score || 0,
                exams: studentData.total_exams || 0
            },
            ai_analysis: aiText,
            topics: topics,
            skill_map: studentData.skill_map || {}
        };
    } catch (error) {
        console.error(error);
        throw error;
    }
}

// ----------------------------------------------------------------------------
// 2. PARSER (TEXT TO HTML)
// ----------------------------------------------------------------------------
function parseAIAnalysis(text) {
    if (!text) return { 
        summary: "Belum ada analisis AI.", strengths: [], weaknesses: [], suggestions: [] 
    };

    const result = { summary: "", strengths: [], weaknesses: [], suggestions: [] };
    const cleanText = text.replace(/\*\*/g, ''); // Hapus bintang markdown
    
    let section = 'summary';
    
    cleanText.split('\n').forEach(line => {
        line = line.trim();
        if (!line) return;
        
        const lower = line.toLowerCase();
        if (lower.includes('kekuatan') || lower.includes('kelebihan')) section = 'strengths';
        else if (lower.includes('kelemahan') || lower.includes('perbaikan')) section = 'weaknesses';
        else if (lower.includes('saran') || lower.includes('rekomendasi')) section = 'suggestions';
        else if (lower.includes('kesimpulan')) section = 'summary';
        else {
            if (line.startsWith('-') || line.startsWith('•') || /^\d+\./.test(line)) {
                const content = line.replace(/^[-•\d+\.]\s*/, '');
                if (section !== 'summary') result[section].push(content);
                else result.summary += line + " ";
            } else {
                if (section === 'summary') result.summary += line + " ";
            }
        }
    });

    // Fallback jika summary kosong
    if (!result.summary) result.summary = text;
    
    return result;
}

// ----------------------------------------------------------------------------
// 2b. RENDER ANALISIS PER TOPIK
// Format baru: topics = [{topik, kelebihan, kekurangan, rekomendasi}, ...]
// ----------------------------------------------------------------------------
function renderTopicsHtml(topics) {
    return topics.map((t, idx) => {
        const topikName   = escapeHtml(t.topik || `Topik ${idx + 1}`);
        const kelebihan   = escapeHtml((t.kelebihan && String(t.kelebihan).trim()) || 'Belum ada catatan kelebihan khusus pada topik ini.');
        const kekurangan  = escapeHtml((t.kekurangan && String(t.kekurangan).trim()) || 'Tidak ada kekurangan berarti pada topik ini — pertahankan!');
        const rekomendasi = escapeHtml((t.rekomendasi && String(t.rekomendasi).trim()) || 'Belum ada rekomendasi khusus untuk topik ini.');

        return `
            <div class="insight-card">
                <div class="insight-header"><i class="fas fa-book"></i> ${idx + 1}. ${topikName}</div>
                <div class="insight-body">
                    <div style="margin-bottom:8px;padding:10px 12px;background:#ecfdf5;border-radius:8px;">
                        <strong style="color:#059669;font-size:0.8rem;">💪 Kelebihan:</strong>
                        <div style="color:#374151;font-size:0.85rem;margin-top:3px;line-height:1.5;">${kelebihan}</div>
                    </div>
                    <div style="margin-bottom:8px;padding:10px 12px;background:#fef2f2;border-radius:8px;">
                        <strong style="color:#ef4444;font-size:0.8rem;">⚠️ Kekurangan:</strong>
                        <div style="color:#374151;font-size:0.85rem;margin-top:3px;line-height:1.5;">${kekurangan}</div>
                    </div>
                    <div style="padding:10px 12px;background:#eff6ff;border-radius:8px;">
                        <strong style="color:#3b82f6;font-size:0.8rem;">📚 Rekomendasi:</strong>
                        <div style="color:#374151;font-size:0.85rem;margin-top:3px;line-height:1.5;">${rekomendasi}</div>
                    </div>
                </div>
            </div>`;
    }).join('');
}

// ----------------------------------------------------------------------------
// 3. RENDER CHART
// ----------------------------------------------------------------------------
function renderChart(canvasId, skillData) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (activeRadarChart) { activeRadarChart.destroy(); activeRadarChart = null; }

    const labels = Object.keys(skillData).length > 0 ? Object.keys(skillData) : ['Logika', 'Konsep', 'Hitungan', 'Analisis'];
    const data = Object.keys(skillData).length > 0 ? Object.values(skillData) : [0, 0, 0, 0];

    activeRadarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Kompetensi',
                data: data,
                backgroundColor: 'rgba(79, 70, 229, 0.2)',
                borderColor: '#4f46e5',
                pointBackgroundColor: '#4f46e5',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: '#e5e7eb' },
                    grid: { color: '#e5e7eb' },
                    suggestedMin: 0,
                    suggestedMax: 100,
                    ticks: { display: false } // Sembunyikan angka di sumbu agar bersih
                }
            },
            plugins: { legend: { display: false } }
        }
    });
}

// ----------------------------------------------------------------------------
// ... (Bagian atas kode biarkan sama) ...

// ----------------------------------------------------------------------------
// 4. MAIN UI FUNCTION (DENGAN TOMBOL PDF)
// ----------------------------------------------------------------------------
async function showStudentDetail(userId) {
    // Setup Modal
    let modal = document.getElementById('aiAnalyticsModal');
    if (!modal) {
        document.querySelectorAll('.analytics-modal').forEach(m => m.remove());
        modal = document.createElement('div');
        modal.id = 'aiAnalyticsModal';
        modal.className = 'analytics-modal';
        document.body.appendChild(modal);
    }

    // Loading State
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="dashboard-container" style="align-items:center; justify-content:center; height:300px;">
            <div style="text-align:center">
                <i class="fas fa-circle-notch fa-spin fa-3x" style="color:#4f46e5; margin-bottom:20px;"></i>
                <h3 style="color:#374151">Menganalisis Data...</h3>
            </div>
        </div>`;

    try {
        const data = await getStudentAIAnalysis(userId);
        const ai = parseAIAnalysis(data.ai_analysis);
        const hasTopics = Array.isArray(data.topics) && data.topics.length > 0;
        const canvasId = `chart_${Date.now()}`;

        // RENDER HTML DASHBOARD
        modal.innerHTML = `
            <div class="dashboard-container">
                <div class="dashboard-header">
                    <div class="student-profile">
                        <div class="avatar">${data.user.nama.charAt(0)}</div>
                        <div class="profile-info">
                            <h2>${data.user.nama}</h2>
                            <p>${data.user.kelas} • Update: ${data.user.last_exam}</p>
                        </div>
                    </div>
                    <div class="header-actions">
                        <button class="btn-primary" onclick="window.print()" style="margin-right: 10px; background: #4f46e5; color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: 500;">
                            <i class="fas fa-file-pdf"></i> Simpan PDF
                        </button>

                        <button class="btn-close" onclick="document.getElementById('aiAnalyticsModal').style.display='none'">
                            <i class="fas fa-times"></i> Tutup
                        </button>
                    </div>
                </div>

                <div class="dashboard-body">
                    
                    <div class="stats-sidebar">
                        <div class="stat-card">
                            <div class="stat-grid">
                                <div class="stat-item">
                                    <h4>Rata-rata</h4>
                                    <span class="value">${data.stats.avg}</span>
                                </div>
                                <div class="stat-item">
                                    <h4>Tertinggi</h4>
                                    <span class="value green">${data.stats.high}</span>
                                </div>
                            </div>
                        </div>

                        <div class="chart-wrapper">
                            <h4 style="margin:0 0 15px 0; color:#6b7280; font-size:0.9rem;">Peta Kompetensi</h4>
                            <div style="height: 280px; position:relative;">
                                <canvas id="${canvasId}"></canvas>
                            </div>
                        </div>
                    </div>

                    <div class="insights-content">

                        ${hasTopics ? `
                        <div class="insight-card card-summary">
                            <div class="insight-header"><i class="fas fa-robot"></i> Analisis Cerdas per Topik</div>
                            <div class="insight-body">Analisis dikelompokkan berdasarkan ${data.topics.length} topik materi yang diujikan.</div>
                        </div>
                        ${renderTopicsHtml(data.topics)}
                        ` : `
                        <div class="insight-card card-summary">
                            <div class="insight-header"><i class="fas fa-robot"></i> Analisis Cerdas</div>
                            <div class="insight-body">${ai.summary}</div>
                        </div>

                        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
                            ${ai.strengths.length > 0 ? `
                            <div class="insight-card card-strength">
                                <div class="insight-header"><i class="fas fa-check-circle"></i> Kekuatan</div>
                                <div class="insight-body">
                                    <ul class="insight-list">
                                        ${ai.strengths.map(s => `<li>${s}</li>`).join('')}
                                    </ul>
                                </div>
                            </div>` : ''}

                            ${ai.weaknesses.length > 0 ? `
                            <div class="insight-card card-weakness">
                                <div class="insight-header"><i class="fas fa-exclamation-triangle"></i> Perhatian</div>
                                <div class="insight-body">
                                    <ul class="insight-list">
                                        ${ai.weaknesses.map(s => `<li>${s}</li>`).join('')}
                                    </ul>
                                </div>
                            </div>` : ''}
                        </div>

                        ${ai.suggestions.length > 0 ? `
                        <div class="insight-card card-suggestion">
                            <div class="insight-header"><i class="fas fa-lightbulb"></i> Rekomendasi Belajar</div>
                            <div class="insight-body">
                                <ul class="insight-list">
                                    ${ai.suggestions.map(s => `<li>${s}</li>`).join('')}
                                </ul>
                            </div>
                        </div>` : ''}
                        `}

                    </div>
                </div>
            </div>
        `;

        // Render Chart
        setTimeout(() => renderChart(canvasId, data.skill_map), 100);

    } catch (err) {
        console.error(err);
        modal.innerHTML = `
            <div class="dashboard-container" style="align-items:center; justify-content:center; height:300px;">
                <div style="text-align:center">
                    <i class="fas fa-exclamation-triangle" style="font-size:2.5rem; color:#ef4444; margin-bottom:16px;"></i>
                    <h3 style="color:#374151; margin-bottom:8px;">Gagal Memuat Analisis</h3>
                    <p style="color:#9ca3af; font-size:0.9rem; margin-bottom:20px;">${escapeHtml(err.message || 'Terjadi kesalahan yang tidak diketahui.')}</p>
                    <button class="btn-close" onclick="document.getElementById('aiAnalyticsModal').style.display='none'">
                        <i class="fas fa-times"></i> Tutup
                    </button>
                </div>
            </div>`;
    }
}

// Export functions to global window
window.showStudentDetail = showStudentDetail;
window.getStudentAIAnalysis = getStudentAIAnalysis;

console.log('✅ Premium UI Design Loaded');