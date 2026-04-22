// student_analytics_table.js - Manajer tabel detail siswa untuk dashboard analytics
import { supabase } from './clientSupabase.js';

/**
 * Class untuk mengelola tabel detail siswa di dashboard analytics
 * Menampilkan: NAMA | KELAS | RATA RATA SKOR | JUMLAH UJIAN | CLUSTER | PREDIKSI SELANJUTNYA | RINGKASAN AI | KEKUATAN | KELEMAHAN | REKOMENDASI | AKSI
 */
class StudentAnalyticsTable {
    constructor(tableId = 'studentsTable') {
        this.tableId = tableId;
        this.studentsData = [];
        this.currentPage = 1;
        this.itemsPerPage = 20;
        this.sortColumn = 'avgScore';
        this.sortDirection = 'desc';
        this.filters = {
            class: 'all',
            cluster: 'all',
            minScore: 0,
            maxScore: 100
        };
    }

    /**
     * Load data siswa dari database
     */
    async loadStudentsData() {
        try {
            console.log('[StudentAnalyticsTable] Loading students data...');

            // Ambil data ujian dengan informasi siswa
            const { data: examData, error: examError } = await supabase
                .from('exam_sessions')
                .select(`
                    *,
                    profiles:user_id (
                        nama_lengkap,
                        class_name
                    )
                `)
                .order('created_at', { ascending: false });

            if (examError) {
                console.error('[StudentAnalyticsTable] Error loading exam data:', examError);
                return [];
            }

            // Ambil semua data analisis AI dari gemini_analyses
            const { data: aiAnalysesRaw, error: aiError } = await supabase
                .from('gemini_analyses')
                .select(`
                    answer_id,
                    analysis_data,
                    exam_answers!inner (
                        exam_session_id,
                        exam_sessions!inner (
                            user_id
                        )
                    )
                `);

            if (aiError) {
                console.warn('[StudentAnalyticsTable] Gagal memuat gemini_analyses (tabel mungkin kosong):', aiError.message);
            }

            // Kelompokkan semua analisis AI per user_id
            const aiByUser = {};
            (aiAnalysesRaw || []).forEach(row => {
                const userId = row.exam_answers?.exam_sessions?.user_id;
                if (!userId || !row.analysis_data) return;

                const analysis = row.analysis_data;

                if (!aiByUser[userId]) {
                    aiByUser[userId] = {
                        summaries: [],
                        strengths: [],
                        weaknesses: [],
                        suggestions: []
                    };
                }

                if (analysis.explanation)
                    aiByUser[userId].summaries.push(analysis.explanation);
                if (Array.isArray(analysis.strengths))
                    aiByUser[userId].strengths.push(...analysis.strengths);
                if (Array.isArray(analysis.weaknesses))
                    aiByUser[userId].weaknesses.push(...analysis.weaknesses);
                if (Array.isArray(analysis.learningSuggestions))
                    aiByUser[userId].suggestions.push(...analysis.learningSuggestions);
            });

            // Kelompokkan berdasarkan siswa dan hitung statistik
            const studentMap = new Map();

            examData.forEach(exam => {
                const studentId = exam.user_id;
                if (!studentMap.has(studentId)) {
                    studentMap.set(studentId, {
                        id: studentId,
                        name: exam.profiles?.nama_lengkap || `Student ${studentId.slice(0, 8)}`,
                        class: exam.profiles?.class_name || 'Unknown',
                        exams: [],
                        totalScore: 0,
                        examCount: 0,
                        avgScore: 0,
                        trend: 'stable',
                        cluster: 'unknown',
                        lastExamDate: null,
                        aiSummary: '-',
                        aiStrengths: [],
                        aiWeaknesses: [],
                        aiSuggestions: []
                    });
                }

                const student = studentMap.get(studentId);
                student.exams.push(exam);
                student.totalScore += exam.total_score || 0;
                student.examCount++;

                const examDate = new Date(exam.created_at);
                if (!student.lastExamDate || examDate > student.lastExamDate) {
                    student.lastExamDate = examDate;
                }
            });

            // Hitung rata-rata, tentukan cluster + trend, dan masukkan data AI
            this.studentsData = Array.from(studentMap.values()).map(student => {
                student.avgScore = student.examCount > 0 ? student.totalScore / student.examCount : 0;

                if (student.avgScore >= 80) {
                    student.cluster = 'high-performer';
                } else if (student.avgScore >= 60) {
                    student.cluster = 'average';
                } else {
                    student.cluster = 'struggling';
                }

                if (student.exams.length >= 2) {
                    const recentExams = student.exams
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                        .slice(0, 2);
                    const trend = recentExams[0].total_score - recentExams[1].total_score;
                    student.trend = trend > 5 ? 'improving' : trend < -5 ? 'declining' : 'stable';
                }

                const ai = aiByUser[student.id];
                if (ai) {
                    student.aiSummary = ai.summaries.length > 0
                        ? ai.summaries[ai.summaries.length - 1]
                        : '-';
                    // MENGHAPUS BATASAN SLICE(0,3) AGAR TAMPIL PENUH SEPERTI DI SISWA
                    student.aiStrengths   = [...new Set(ai.strengths)];
                    student.aiWeaknesses  = [...new Set(ai.weaknesses)];
                    student.aiSuggestions = [...new Set(ai.suggestions)];
                }

                return student;
            });

            console.log(`[StudentAnalyticsTable] Loaded ${this.studentsData.length} students`);
            return this.studentsData;

        } catch (error) {
            console.error('[StudentAnalyticsTable] Error loading students data:', error);
            return [];
        }
    }

    renderTable(containerId = this.tableId) {
        const table = document.getElementById(containerId);
        if (!table) return;

        const tbody = table.querySelector('tbody');
        if (!tbody) return;

        let filteredData = this.applyFilters();
        filteredData = this.applySorting(filteredData);

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const paginatedData = filteredData.slice(startIndex, endIndex);

        tbody.innerHTML = paginatedData.map(student => this.createTableRow(student)).join('');

        this.updatePaginationInfo(filteredData.length);
    }

    createTableRow(student) {
        const predictionText = this.getPredictionText(student);
        const clusterDisplay = this.getClusterDisplay(student.cluster);

        // Menambahkan max-height dan scroll agar tidak merusak UI tabel ketika data panjang
        const renderAiList = (items) => {
            if (!items || items.length === 0) return '<span style="color:#9ca3af;font-style:italic;">-</span>';
            return '<div style="max-height:120px; overflow-y:auto; padding-right:5px;"><ul style="margin:0;padding-left:16px;font-size:0.78rem;color:#374151;">'
                + items.map(i => `<li style="margin-bottom:3px;">${this.escapeHtml(i)}</li>`).join('')
                + '</ul></div>';
        };

        const aiSummaryHtml = (student.aiSummary && student.aiSummary !== '-')
            ? `<div style="max-height:120px; overflow-y:auto; font-size:0.78rem;color:#374151;line-height:1.4; padding-right:5px;">${this.escapeHtml(student.aiSummary)}</div>`
            : '<span style="color:#9ca3af;font-style:italic;">-</span>';

        return `
            <tr data-student-id="${student.id}">
                <td class="student-name">${this.escapeHtml(student.name)}</td>
                <td class="student-class">${this.escapeHtml(student.class)}</td>
                <td class="student-avg-score">${student.avgScore.toFixed(1)}</td>
                <td class="student-exam-count">${student.examCount}</td>
                <td class="student-cluster">
                    <span class="cluster-badge ${student.cluster}">${clusterDisplay}</span>
                </td>
                <td class="student-prediction">${predictionText}</td>

                <td class="student-ai-summary" style="max-width:220px;">${aiSummaryHtml}</td>
                <td class="student-ai-strengths" style="max-width:180px;">${renderAiList(student.aiStrengths)}</td>
                <td class="student-ai-weaknesses" style="max-width:180px;">${renderAiList(student.aiWeaknesses)}</td>
                <td class="student-ai-suggestions" style="max-width:200px;">${renderAiList(student.aiSuggestions)}</td>

                <td class="student-actions">
                    <button onclick="showStudentDetail('${student.id}')" class="action-btn detail-btn" title="Lihat detail siswa">
                        <i class="fas fa-eye"></i> Detail
                    </button>
                    <button onclick="window.open('ai_viewer.html?student_id=${student.id}&student_name=${encodeURIComponent(student.name)}', '_blank')" class="action-btn ai-btn" title="Lihat Analisis AI" style="background: linear-gradient(135deg, #7c3aed, #4f46e5); color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; display: inline-flex; align-items: center; gap: 4px;">
                        <i class="fas fa-robot"></i> Analisis AI
                    </button>
                </td>
            </tr>
        `;
    }

    getPredictionText(student) {
        const predictions = {
            'high-performer': 'Akan terus excellent',
            'average': 'Berpotensi meningkat',
            'struggling': 'Perlu intervensi'
        };
        return predictions[student.cluster] || 'Unknown';
    }

    getClusterDisplay(cluster) {
        const displays = {
            'high-performer': 'Berprestasi Tinggi',
            'average': 'Sedang',
            'struggling': 'Perlu Bantuan'
        };
        return displays[cluster] || cluster.replace('-', ' ');
    }

    applyFilters() {
        return this.studentsData.filter(student => {
            if (this.filters.class !== 'all' && student.class !== this.filters.class) return false;
            if (this.filters.cluster !== 'all' && student.cluster !== this.filters.cluster) return false;
            if (student.avgScore < this.filters.minScore || student.avgScore > this.filters.maxScore) return false;
            return true;
        });
    }

    applySorting(data) {
        return [...data].sort((a, b) => {
            let aVal = a[this.sortColumn];
            let bVal = b[this.sortColumn];

            if (typeof aVal === 'string') aVal = aVal.toLowerCase();
            if (typeof bVal === 'string') bVal = bVal.toLowerCase();

            if (aVal < bVal) return this.sortDirection === 'asc' ? -1 : 1;
            if (aVal > bVal) return this.sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    setSorting(column, direction = 'desc') {
        this.sortColumn = column;
        this.sortDirection = direction;
        this.renderTable();
    }

    setFilters(filters) {
        this.filters = { ...this.filters, ...filters };
        this.currentPage = 1;
        this.renderTable();
    }

    updatePaginationInfo(totalItems) {
        const totalPages = Math.ceil(totalItems / this.itemsPerPage);
        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, totalItems);

        const paginationInfo = document.getElementById('paginationInfo');
        if (paginationInfo) {
            paginationInfo.textContent = `Menampilkan ${startItem}-${endItem} dari ${totalItems} siswa`;
        }

        const paginationControls = document.getElementById('paginationControls');
        if (paginationControls) {
            paginationControls.innerHTML = this.createPaginationControls(totalPages);
        }
    }

    createPaginationControls(totalPages) {
        let controls = '';

        controls += `<button onclick="studentTable.goToPage(${this.currentPage - 1})" ${this.currentPage <= 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>`;

        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);

        for (let i = startPage; i <= endPage; i++) {
            controls += `<button onclick="studentTable.goToPage(${i})" class="${i === this.currentPage ? 'active' : ''}">${i}</button>`;
        }

        controls += `<button onclick="studentTable.goToPage(${this.currentPage + 1})" ${this.currentPage >= totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>`;

        return controls;
    }

    goToPage(page) {
        if (page >= 1 && page <= Math.ceil(this.studentsData.length / this.itemsPerPage)) {
            this.currentPage = page;
            this.renderTable();
        }
    }

    exportToCSV() {
        const headers = [
            'Nama Siswa', 'Kelas', 'Rata-rata Skor', 'Jumlah Ujian',
            'Cluster', 'Prediksi Selanjutnya',
            'Ringkasan AI', 'Kekuatan', 'Kelemahan', 'Rekomendasi'
        ];
        const rows = this.studentsData.map(student => [
            student.name,
            student.class,
            student.avgScore.toFixed(1),
            student.examCount,
            this.getClusterDisplay(student.cluster),
            this.getPredictionText(student),
            student.aiSummary || '-',
            (student.aiStrengths || []).join(' | '),
            (student.aiWeaknesses || []).join(' | '),
            (student.aiSuggestions || []).join(' | ')
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `data-siswa-${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        return csvContent;
    }

    searchStudents(query) {
        if (!query.trim()) {
            this.renderTable();
            return;
        }

        const filteredData = this.studentsData.filter(student =>
            student.name.toLowerCase().includes(query.toLowerCase()) ||
            student.class.toLowerCase().includes(query.toLowerCase())
        );

        const table = document.getElementById(this.tableId);
        const tbody = table.querySelector('tbody');
        tbody.innerHTML = filteredData.slice(0, this.itemsPerPage).map(student => this.createTableRow(student)).join('');

        const paginationInfo = document.getElementById('paginationInfo');
        if (paginationInfo) {
            paginationInfo.textContent = `Ditemukan ${filteredData.length} siswa untuk "${query}"`;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    async refresh() {
        await this.loadStudentsData();
        this.renderTable();
    }

    getSummaryStats() {
        const total = this.studentsData.length;
        const highPerformers = this.studentsData.filter(s => s.cluster === 'high-performer').length;
        const average = this.studentsData.filter(s => s.cluster === 'average').length;
        const struggling = this.studentsData.filter(s => s.cluster === 'struggling').length;
        const avgScore = total > 0 ? this.studentsData.reduce((sum, s) => sum + s.avgScore, 0) / total : 0;

        return {
            totalStudents: total,
            highPerformers,
            average,
            struggling,
            averageScore: avgScore.toFixed(1),
            passRate: ((highPerformers + average) / total * 100).toFixed(1)
        };
    }
}

export { StudentAnalyticsTable };
export const studentTable = new StudentAnalyticsTable();

window.showStudentDetail = async function(studentId) {
    if (window.showStudentDetailFromAnalytics) {
        window.showStudentDetailFromAnalytics(studentId);
    } else {
        console.log(`Show detail for student: ${studentId}`);
    }
};

// Tampilkan detail analytics siswa (Versi Modal V3 Original yang juga dihapus batasannya)
async function showStudentDetail(userId) {
    try {
        const { getDetailedStudentAnalytics } = await import('./exam_analytics_system.js');
        const analytics = await getDetailedStudentAnalytics(userId);
        if (!analytics) {
            alert('Data analytics siswa tidak ditemukan.');
            return;
        }

        let aiAnalyses = [];
        try {
            const sessionIds = analytics.exams.map(e => e.sessionId);
            if (sessionIds.length > 0) {
                const { data: answerIds } = await supabase
                    .from('exam_answers')
                    .select('id, question_id')
                    .in('exam_session_id', sessionIds)
                    .limit(50);

                if (answerIds && answerIds.length > 0) {
                    const { data: geminiData } = await supabase
                        .from('gemini_analyses')
                        .select('*')
                        .in('answer_id', answerIds.map(a => a.id))
                        .limit(20);
                    aiAnalyses = geminiData || [];
                }
            }
        } catch (e) {
            console.warn('Could not load AI analyses:', e);
        }

        const chapterLabels = analytics.chapterPerformance.map(c => c.chapter);
        const chapterAccuracy = analytics.chapterPerformance.map(c => Math.round(c.accuracy || 0));

        let aiSummary = '<p style="color:#6b7280;">Belum ada analisis AI untuk siswa ini.</p>';
        if (aiAnalyses.length > 0) {
            // MENGHAPUS BATASAN SLICE(0,3) PADA MODAL POP-UP ADMIN
            const strengths = [...new Set(aiAnalyses.flatMap(a => a.analysis_data?.strengths || []))];
            const weaknesses = [...new Set(aiAnalyses.flatMap(a => a.analysis_data?.weaknesses || []))];
            const suggestions = [...new Set(aiAnalyses.flatMap(a => a.analysis_data?.learningSuggestions || []))];

            aiSummary = `
                <div style="margin-bottom:1rem; max-height: 120px; overflow-y: auto;">
                    <strong style="color:#10b981;">💪 Kelebihan:</strong>
                    <ul style="margin:0.5rem 0 0 1rem;color:#374151;">
                        ${strengths.length > 0 ? strengths.map(s => `<li>${s}</li>`).join('') : '<li>Data belum tersedia</li>'}
                    </ul>
                </div>
                <div style="margin-bottom:1rem; max-height: 120px; overflow-y: auto;">
                    <strong style="color:#ef4444;">⚠️ Area Perbaikan:</strong>
                    <ul style="margin:0.5rem 0 0 1rem;color:#374151;">
                        ${weaknesses.length > 0 ? weaknesses.map(w => `<li>${w}</li>`).join('') : '<li>Data belum tersedia</li>'}
                    </ul>
                </div>
                <div style="max-height: 120px; overflow-y: auto;">
                    <strong style="color:#3b82f6;">📚 Rekomendasi Belajar:</strong>
                    <ul style="margin:0.5rem 0 0 1rem;color:#374151;">
                        ${suggestions.length > 0 ? suggestions.map(s => `<li>${s}</li>`).join('') : '<li>Data belum tersedia</li>'}
                    </ul>
                </div>
            `;
        }

        const uniqueId = 'radar_' + userId.replace(/-/g, '').slice(0, 10);

        // ── Bangun Matriks Kognitif (Bab × Level Kognitif) ──────────────────────
        const CHAPTERS_MATRIX = ['Bilangan', 'Aljabar', 'Geometri & Pengukuran', 'Data dan Peluang'];
        const LEVELS_MATRIX = ['Level 1', 'Level 2', 'Level 3'];
        const CHAPTER_MAP_MATRIX = {
            'bilangan': 'Bilangan',
            'aljabar': 'Aljabar',
            'geometri': 'Geometri & Pengukuran',
            'pengukuran': 'Geometri & Pengukuran',
            'data': 'Data dan Peluang',
            'peluang': 'Data dan Peluang'
        };

        // Ambil detail soal dari analytics
        const cogMatrix = {};
        CHAPTERS_MATRIX.forEach(c => {
            cogMatrix[c] = {};
            LEVELS_MATRIX.forEach(l => { cogMatrix[c][l] = { benar: 0, salah: 0 }; });
        });

        if (analytics.questionDetails && analytics.questionDetails.length > 0) {
            analytics.questionDetails.forEach(q => {
                const rawChapter = (q.chapter || '').toLowerCase().trim();
                let chapter = null;
                for (const [key, label] of Object.entries(CHAPTER_MAP_MATRIX)) {
                    if (rawChapter.includes(key)) { chapter = label; break; }
                }
                if (!chapter) return;

                const diff = (q.difficulty || '').toLowerCase();
                let levelKey = 'Level 2';
                if (diff === 'mudah' || diff === 'easy' || diff === 'l1') levelKey = 'Level 1';
                else if (diff === 'sulit' || diff === 'hard' || diff === 'l3') levelKey = 'Level 3';

                if (q.isCorrect) cogMatrix[chapter][levelKey].benar++;
                else cogMatrix[chapter][levelKey].salah++;
            });
        }

        const matrixRows = CHAPTERS_MATRIX.map(bab => {
            let totalB = 0, totalS = 0;
            const cells = LEVELS_MATRIX.map(lv => {
                const c = cogMatrix[bab][lv];
                totalB += c.benar; totalS += c.salah;
                if (c.benar === 0 && c.salah === 0) return `<td style="text-align:center;padding:7px 10px;border:1px solid #f3f4f6;color:#d1d5db;">—</td>`;
                return `<td style="text-align:center;padding:7px 10px;border:1px solid #f3f4f6;">
                    <span style="color:#059669;font-weight:700;">${c.benar}</span><span style="color:#9ca3af;margin:0 2px;">/</span><span style="color:#dc2626;">${c.salah}</span>
                </td>`;
            }).join('');
            const hasData = totalB > 0 || totalS > 0;
            return `<tr>
                <td style="padding:7px 10px;border:1px solid #f3f4f6;font-weight:600;color:#374151;font-size:0.82rem;">${bab}</td>
                ${cells}
                <td style="text-align:center;padding:7px 10px;border:1px solid #f3f4f6;">
                    ${hasData ? `<strong style="color:#4f46e5;">${totalB + totalS}</strong><span style="font-size:0.72rem;color:#9ca3af;"> (${totalB}✓)</span>` : '<span style="color:#d1d5db;">—</span>'}
                </td>
            </tr>`;
        }).join('');

        const cogMatrixHtml = `
        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:1rem;margin-top:1.5rem;">
            <h4 style="margin:0 0 12px;color:#374151;font-size:0.92rem;">
                <i class="fas fa-table" style="color:#8b5cf6;"></i> Matriks Performa Kognitif
            </h4>
            <p style="font-size:0.75rem;color:#9ca3af;margin-bottom:10px;">Sel: <strong style="color:#059669;">Benar</strong> / <strong style="color:#dc2626;">Salah</strong></p>
            <div style="overflow-x:auto;">
                <table style="width:100%;border-collapse:collapse;font-size:0.8rem;">
                    <thead>
                        <tr>
                            <th style="background:#f5f3ff;color:#6d28d9;padding:8px 10px;text-align:left;border:1px solid #e9d5ff;white-space:nowrap;">Bab / Materi</th>
                            <th style="background:#f5f3ff;color:#6d28d9;padding:8px 10px;text-align:center;border:1px solid #e9d5ff;white-space:nowrap;">Level 1<br><span style="font-weight:400;font-size:0.72rem;">Pengetahuan</span></th>
                            <th style="background:#f5f3ff;color:#6d28d9;padding:8px 10px;text-align:center;border:1px solid #e9d5ff;white-space:nowrap;">Level 2<br><span style="font-weight:400;font-size:0.72rem;">Aplikasi</span></th>
                            <th style="background:#f5f3ff;color:#6d28d9;padding:8px 10px;text-align:center;border:1px solid #e9d5ff;white-space:nowrap;">Level 3<br><span style="font-weight:400;font-size:0.72rem;">Penalaran</span></th>
                            <th style="background:#f5f3ff;color:#6d28d9;padding:8px 10px;text-align:center;border:1px solid #e9d5ff;">Total</th>
                        </tr>
                    </thead>
                    <tbody>${matrixRows}</tbody>
                </table>
            </div>
        </div>`;

        const modal = document.createElement('div');
        modal.className = 'analytics-modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width:900px;width:95%;">
                <div class="modal-header">
                    <div>
                        <h2>${analytics.student.nama_lengkap || 'Siswa'}</h2>
                        <p style="margin:0;color:#6b7280;font-size:0.9rem;">Update: ${new Date().toLocaleDateString('id-ID')}</p>
                    </div>
                    <div style="display:flex;gap:0.5rem;align-items:center;">
                        <button onclick="exportStudentToExcel('${userId}')" class="add-btn" style="font-size:0.85rem;padding:0.5rem 1rem;">
                            <i class="fas fa-file-excel"></i> Export
                        </button>
                        <button onclick="exportStudentToGoogleSheet('${userId}')" class="add-btn" style="font-size:0.85rem;padding:0.5rem 1rem;background:#059669;">
                            <i class="fas fa-table"></i> Google Sheet
                        </button>
                        <button onclick="this.closest('.analytics-modal').remove()" class="cancel-btn" style="font-size:0.85rem;padding:0.5rem 1rem;">✕ Tutup</button>
                    </div>
                </div>
                <div class="modal-body" style="display:grid;grid-template-columns:1fr 1fr;gap:1.5rem;padding:1.5rem;">
                    <div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1.5rem;">
                            <div style="background:#f0fdf4;border-radius:10px;padding:1rem;text-align:center;">
                                <div style="font-size:0.8rem;color:#6b7280;">RATA-RATA</div>
                                <div style="font-size:2rem;font-weight:700;color:#10b981;">${analytics.summary.averageScore}</div>
                            </div>
                            <div style="background:#eff6ff;border-radius:10px;padding:1rem;text-align:center;">
                                <div style="font-size:0.8rem;color:#6b7280;">TERTINGGI</div>
                                <div style="font-size:2rem;font-weight:700;color:#3b82f6;">${analytics.summary.highestScore || 0}</div>
                            </div>
                            <div style="background:#fefce8;border-radius:10px;padding:1rem;text-align:center;">
                                <div style="font-size:0.8rem;color:#6b7280;">TOTAL UJIAN</div>
                                <div style="font-size:2rem;font-weight:700;color:#f59e0b;">${analytics.summary.totalExams}</div>
                            </div>
                            <div style="background:#fdf4ff;border-radius:10px;padding:1rem;text-align:center;">
                                <div style="font-size:0.8rem;color:#6b7280;">KELULUSAN</div>
                                <div style="font-size:2rem;font-weight:700;color:#8b5cf6;">${analytics.summary.passRate}%</div>
                            </div>
                        </div>
                        ${cogMatrixHtml}
                    </div>
                    <div>
                        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:1rem;margin-bottom:1.5rem;">
                            <h4 style="margin:0 0 1rem;color:#374151;font-size:0.95rem;">
                                <i class="fas fa-robot" style="color:#8b5cf6;"></i> Analisis Cerdas AI
                            </h4>
                            <div style="font-size:0.88rem;line-height:1.6;">${aiSummary}</div>
                        </div>
                        <div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:1rem;">
                            <h4 style="margin:0 0 1rem;color:#374151;font-size:0.95rem;">
                                <i class="fas fa-chart-bar" style="color:#10b981;"></i> Performa per Bab
                            </h4>
                            ${analytics.chapterPerformance.length === 0
                                ? '<p style="text-align:center;color:#9ca3af;font-size:0.85rem;">Belum ada data</p>'
                                : analytics.chapterPerformance.map(c => `
                                    <div style="margin-bottom:0.75rem;">
                                        <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;">
                                            <span style="font-size:0.85rem;color:#374151;">${c.chapter}</span>
                                            <span style="font-size:0.85rem;font-weight:600;color:${Math.round(c.accuracy||0) >= 70 ? '#10b981' : '#ef4444'};">${Math.round(c.accuracy||0)}%</span>
                                        </div>
                                        <div style="height:6px;background:#f3f4f6;border-radius:3px;">
                                            <div style="height:6px;border-radius:3px;width:${Math.round(c.accuracy||0)}%;background:${Math.round(c.accuracy||0) >= 70 ? '#10b981' : '#ef4444'};"></div>
                                        </div>
                                    </div>
                                `).join('')
                            }
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        if (chapterLabels.length > 0 && window.Chart) {
            setTimeout(() => {
                const canvas = document.getElementById(uniqueId);
                if (!canvas) return;
                new Chart(canvas.getContext('2d'), {
                    type: 'radar',
                    data: {
                        labels: chapterLabels,
                        datasets: [{
                            label: 'Akurasi (%)',
                            data: chapterAccuracy,
                            backgroundColor: 'rgba(102, 126, 234, 0.2)',
                            borderColor: 'rgba(102, 126, 234, 1)',
                            borderWidth: 2,
                            pointBackgroundColor: 'rgba(102, 126, 234, 1)',
                            pointRadius: 4
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        scales: {
                            r: {
                                beginAtZero: true,
                                max: 100,
                                ticks: { stepSize: 20, font: { size: 10 } }
                            }
                        },
                        plugins: { legend: { display: false } }
                    }
                });
            }, 100);
        }

    } catch (error) {
        console.error('Error showing student detail:', error);
    }
}

// Build Export Data function
async function buildStudentExportData(userId) {
    const { getDetailedStudentAnalytics } = await import('./exam_analytics_system.js');
    const analytics = await getDetailedStudentAnalytics(userId);
    if (!analytics) return null;

    const petaKompetensi = analytics.chapterPerformance
        .map(c => `${c.chapter}: ${Math.round(c.accuracy||0)}%`)
        .join(' | ') || '-';

    async function getAIPerSession(sessionId) {
        try {
            const { data: batchRecord } = await supabase
                .from('gemini_analyses')
                .select('analysis_data')
                .eq('answer_id', sessionId)
                .maybeSingle();

            if (batchRecord?.analysis_data?.is_batch) {
                const bd = batchRecord.analysis_data;
                // DIHAPUS BATASAN SLICE(0,3) UNTUK EXPORT
                const strengths = (bd.strengths || []).filter(s => s && s.length > 3);
                const weaknesses = (bd.weaknesses || []).filter(w => w && w.length > 3);
                const suggestions = (bd.learningSuggestions || []).filter(s => s && s.length > 3);
                const summary = bd.summary || '';
                
                if (strengths.length > 0 || weaknesses.length > 0 || summary) {
                    return {
                        ringkasan: summary || (weaknesses.length > 0 ? weaknesses[0] : strengths[0] || '-'),
                        kekuatan: strengths.length > 0 ? strengths.join('; ') : '-',
                        kelemahan: weaknesses.length > 0 ? weaknesses.join('; ') : '-',
                        rekomendasi: suggestions.length > 0 ? suggestions.join('; ') : '-'
                    };
                }
            }

            // Fallback individual
            const { data: allAnswers } = await supabase
                .from('exam_answers').select('id')
                .eq('exam_session_id', sessionId);
                
            if (!allAnswers || allAnswers.length === 0) return null;
            const allAnswerIds = allAnswers.map(a => a.id);

            const { data: geminiData } = await supabase
                .from('gemini_analyses').select('analysis_data')
                .in('answer_id', allAnswerIds);
                
            if (!geminiData || geminiData.length === 0) return null;

            const parsedData = geminiData.map(g => {
                let ad = g.analysis_data;
                if (typeof ad === 'string') {
                    try {
                        const clean = ad.replace(/```json/g,'').replace(/```/g,'').trim();
                        const match = clean.match(/\{[\s\S]*\}/);
                        if (match) ad = JSON.parse(match[0]);
                    } catch(e) { ad = { explanation: ad }; }
                }
                return ad;
            }).filter(Boolean);

            // DIHAPUS BATASAN SLICE(0,3)
            const strengths = [...new Set(parsedData.flatMap(g => g?.strengths || []))].filter(s => s && s.length > 3 && !s.includes('{') && !s.includes('json'));
            const weaknesses = [...new Set(parsedData.flatMap(g => g?.weaknesses || []))].filter(w => w && w.length > 3 && !w.includes('{') && !w.includes('json'));
            const suggestions = [...new Set(parsedData.flatMap(g => g?.learningSuggestions || []))].filter(s => s && s.length > 3 && !s.includes('{') && !s.includes('json'));

            let ringkasan = '';
            if (strengths.length > 0 && weaknesses.length > 0) {
                ringkasan = `Siswa memiliki kekuatan dalam ${strengths[0].toLowerCase()}. Perlu perhatian pada ${weaknesses[0].toLowerCase()}.`;
            } else if (strengths.length > 0) {
                ringkasan = `Siswa menunjukkan pemahaman yang baik dalam ${strengths[0].toLowerCase()}.`;
            } else if (weaknesses.length > 0) {
                ringkasan = `Siswa perlu meningkatkan pemahaman pada ${weaknesses[0].toLowerCase()}.`;
            } else {
                const rawExp = parsedData.find(g => g?.explanation?.length > 10)?.explanation || '';
                ringkasan = rawExp.replace(/```json[\s\S]*?```/g,'').replace(/\{[\s\S]*?\}/g,'').trim();
                if (!ringkasan || ringkasan.length < 5) ringkasan = 'Analisis tersedia. Lihat kekuatan dan kelemahan.';
            }

            return {
                ringkasan: ringkasan,
                kekuatan: strengths.length > 0 ? strengths.join('; ') : '-',
                kelemahan: weaknesses.length > 0 ? weaknesses.join('; ') : '-',
                rekomendasi: suggestions.length > 0 ? suggestions.join('; ') : '-'
            };
        } catch(e) {
            return null;
        }
    }

    const rows = [];
    if (analytics.exams.length === 0) {
        rows.push([
            analytics.student.nama_lengkap || '-',
            analytics.student.email || '-',
            analytics.student.class_name || '-',
            '-', '-', '-', petaKompetensi, 0, 0, 0, '-', '-', '-', '-'
        ]);
    } else {
        for (const exam of analytics.exams) {
            const startTime = exam.date ? new Date(exam.date) : null;
            const durasiMenit = exam.timeSpent ? Math.round(exam.timeSpent / 60) + ' menit' : '-';
            const jumlahBenar = exam.correctAnswers || 0;
            const jumlahSalah = (exam.totalQuestions || 0) - jumlahBenar;
            // Tidak Dijawab = Total Soal - Benar - Salah
            // Dalam konteks ini salah sudah mencakup yang dijawab tapi salah,
            // sedangkan "tidak dijawab" berasal dari totalQuestions - answered count
            const jumlahTidakDijawab = Math.max(0, (exam.totalQuestions || 0) - jumlahBenar - Math.max(0, jumlahSalah));

            const ai = await getAIPerSession(exam.sessionId);

            rows.push([
                analytics.student.nama_lengkap || '-',       // 0
                analytics.student.email || '-',               // 1
                analytics.student.class_name || analytics.student.school || '-', // 2
                exam.questionTypeVariant || '-',               // 3
                startTime ? startTime.toLocaleDateString('id-ID') : '-', // 4
                durasiMenit,                                  // 5 (was index 6, shifted after removing waktu mulai)
                exam.totalScore || 0,                         // 6 (was 9)
                petaKompetensi,                               // 7 (was 8)
                jumlahBenar,                                  // 8 (was 7 correctAnswers)
                Math.max(0, jumlahSalah),                     // 9 (was 10)
                jumlahTidakDijawab,                           // 10 NEW
                ai ? ai.ringkasan : '-',                      // 11 (was 11)
                ai ? ai.kekuatan : '-',                       // 12 (was 12)
                ai ? ai.kelemahan : '-',                      // 13 (was 13)
                ai ? ai.rekomendasi : '-',                    // 14 (was 14)
                exam.sessionId || '-'                         // 15 (NEW - for Lihat Jawaban btn)
            ]);
        }
    }
    return rows;
}

// ----------------------------------------------------------------------------
// LOAD FULL SUMMARY TABLE
// Menghilangkan fungsi trim (potong) 80 karakter, diganti dengan format scroll
// ----------------------------------------------------------------------------
async function loadFullSummaryTable() {
    const tbody = document.getElementById('fullSummaryTableBody');
    if (!tbody) return;

    tbody.innerHTML = `<tr><td colspan="16" style="padding:2rem;text-align:center;color:#6b7280;">
        <i class="fas fa-spinner fa-spin"></i> Memuat data semua siswa...
    </td></tr>`;

    try {
        const { getAllStudentsAnalytics } = await import('./exam_analytics_system.js');
        const students = await getAllStudentsAnalytics();
        if (!students || students.length === 0) {
            tbody.innerHTML = `<tr><td colspan="16" style="padding:2rem;text-align:center;color:#6b7280;">Belum ada data siswa.</td></tr>`;
            return;
        }

        let allRows = [];

        for (const student of students) {
            try {
                const rows = await buildStudentExportData(student.id);
                if (rows) allRows = allRows.concat(rows);
            } catch(e) {
                console.warn('Error loading data for student:', student.id, e);
            }
        }

        if (allRows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="16" style="padding:2rem;text-align:center;color:#6b7280;">Belum ada data ujian.</td></tr>`;
            return;
        }

        tbody.innerHTML = allRows.map((row, idx) => {
            const bgColor = idx % 2 === 0 ? '#ffffff' : '#f9fafb';
            const skor = row[6] || 0;   // index shifted: was row[9]
            const skorColor = skor >= 70 ? '#059669' : skor >= 50 ? '#d97706' : '#dc2626';

            const trim = (text, max = 60) => {
                const str = String(text || '-');
                return str.length > max
                    ? `<span title="${str.replace(/"/g, '&quot;')}">${str.substring(0, max)}...</span>`
                    : str;
            };

            const formatAIList = (text) => {
                if (!text || text === '-') return '<span style="color:#9ca3af;font-style:italic;">-</span>';
                if (!String(text).includes('; ')) {
                    return `<div style="max-height:150px; overflow-y:auto; padding-right:5px; line-height:1.4;">${text}</div>`;
                }
                const items = String(text).split('; ');
                return `<div style="max-height:150px; overflow-y:auto; padding-right:5px;">
                            <ul style="margin:0;padding-left:16px;line-height:1.4;">
                                ${items.map(i => `<li style="margin-bottom:4px;">${i}</li>`).join('')}
                            </ul>
                        </div>`;
            };

            // Peta kompetensi (index 7)
            const petaHtml = (() => {
                const peta = String(row[7] || '-');
                if (peta === '-') return '-';
                const items = peta.split('|').map(s => s.trim()).filter(Boolean);
                if (items.length === 0) return peta;
                return items.map(item => {
                    const match = item.match(/^(.+):\s*(\d+)%$/);
                    if (!match) return `<div style="font-size:0.7rem;color:#6b7280;">${item}</div>`;
                    const [, bab, pct] = match;
                    const pctNum = parseInt(pct);
                    const color = pctNum >= 70 ? '#10b981' : pctNum >= 50 ? '#f59e0b' : '#ef4444';
                    return `<div style="margin-bottom:3px;">
                        <div style="display:flex;justify-content:space-between;font-size:0.68rem;">
                            <span style="color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:120px;" title="${bab}">${bab}</span>
                            <span style="color:${color};font-weight:600;margin-left:4px;">${pct}%</span>
                        </div>
                        <div style="height:4px;background:#f3f4f6;border-radius:2px;margin-top:1px;">
                            <div style="height:4px;width:${pctNum}%;background:${color};border-radius:2px;"></div>
                        </div>
                    </div>`;
                }).join('');
            })();

            const sessionId = row[15] || '';
            const studentName = encodeURIComponent(row[0] || 'Siswa');

            return `<tr style="background:${bgColor};border-bottom:1px solid #f3f4f6;">
                <td style="padding:8px 12px;font-weight:600;color:#1f2937;">${trim(row[0])}</td>
                <td style="padding:8px 12px;color:#6b7280;">${trim(row[1])}</td>
                <td style="padding:8px 12px;">${trim(row[2], 20)}</td>
                <td style="padding:8px 12px;">
                    <span style="background:#eef2ff;color:#4f46e5;padding:2px 8px;border-radius:12px;font-size:0.78rem;font-weight:600;">
                        ${row[3] || '-'}
                    </span>
                </td>
                <td style="padding:8px 12px;white-space:nowrap;color:#6b7280;">${row[4] || '-'}</td>
                <td style="padding:8px 12px;white-space:nowrap;">${row[5] || '-'}</td>
                <td style="padding:8px 12px;text-align:center;">
                    <span style="background:${skorColor};color:white;padding:3px 10px;border-radius:12px;font-weight:700;font-size:0.88rem;">
                        ${skor}
                    </span>
                </td>
                <td style="padding:8px 12px;font-size:0.75rem;color:#374151;max-width:220px;">${petaHtml}</td>
                <td style="padding:8px 12px;text-align:center;color:#059669;font-weight:600;">${row[8] || 0}</td>
                <td style="padding:8px 12px;text-align:center;color:#dc2626;font-weight:600;">${row[9] !== undefined ? row[9] : '-'}</td>
                <td style="padding:8px 12px;text-align:center;color:#f59e0b;font-weight:600;">${row[10] !== undefined ? row[10] : '-'}</td>
                <td style="padding:8px 12px;font-size:0.78rem;color:#374151;max-width:220px;vertical-align:top;">${formatAIList(row[11])}</td>
                <td style="padding:8px 12px;font-size:0.78rem;color:#059669;max-width:200px;vertical-align:top;">${formatAIList(row[12])}</td>
                <td style="padding:8px 12px;font-size:0.78rem;color:#dc2626;max-width:200px;vertical-align:top;">${formatAIList(row[13])}</td>
                <td style="padding:8px 12px;font-size:0.78rem;color:#3b82f6;max-width:200px;vertical-align:top;">${formatAIList(row[14] || row[13])}</td>
                <td style="padding:8px 12px;text-align:center;">
                    ${sessionId && sessionId !== '-'
                        ? `<button onclick="openExamDetailFromTable('${sessionId}', '${studentName}')"
                            style="background:#667eea;color:white;border:none;padding:6px 12px;border-radius:8px;cursor:pointer;font-size:0.78rem;display:inline-flex;align-items:center;gap:5px;white-space:nowrap;">
                            <i class='fas fa-eye'></i> Lihat Jawaban
                           </button>`
                        : '<span style="color:#d1d5db;font-size:0.78rem;">-</span>'}
                </td>
            </tr>`;
        }).join('');

    } catch (error) {
        console.error('Error loading full summary table:', error);
        tbody.innerHTML = `<tr><td colspan="16" style="padding:2rem;text-align:center;color:#ef4444;">
            Error: ${error.message}
        </td></tr>`;
    }
}

// ──────────────────────────────────────────────────────────────
// Buka modal examDetailModal dari tabel analytics (tombol Lihat Jawaban)
// ──────────────────────────────────────────────────────────────
window.openExamDetailFromTable = async function(sessionId, studentName) {
    if (!sessionId || sessionId === '-' || sessionId === 'undefined') {
        alert('Session ID tidak valid.');
        return;
    }

    // Gunakan fungsi viewExamDetail yang sudah ada di admin.html (atau buat fallback)
    if (typeof window.viewExamDetail === 'function') {
        window.viewExamDetail(sessionId);
        return;
    }

    // Fallback: buat modal sederhana jika viewExamDetail tidak tersedia
    const modal = document.getElementById('examDetailModal');
    const content = document.getElementById('examDetailContent');
    if (!modal || !content) {
        alert('Modal detail ujian tidak ditemukan di halaman ini.');
        return;
    }

    modal.style.display = 'flex';
    content.innerHTML = `<div style="text-align:center;padding:40px;">
        <i class="fas fa-spinner fa-spin" style="font-size:2rem;color:#667eea;"></i>
        <p style="margin-top:16px;color:#6b7280;">Memuat jawaban siswa...</p>
    </div>`;

    try {
        // Ambil session
        const { data: session } = await supabase
            .from('exam_sessions').select('*').eq('id', sessionId).single();

        // Ambil profil siswa
        let student = {};
        if (session?.user_id) {
            const { data: profile } = await supabase
                .from('profiles').select('nama_lengkap, class_name').eq('id', session.user_id).single();
            if (profile) student = profile;
        }

        // Ambil jawaban + soal
        const { data: answers } = await supabase
            .from('exam_answers')
            .select(`
                *,
                questions (
                    id, question_text, question_type, option_a, option_b, option_c, option_d,
                    correct_answer, correct_answers, category_mapping, category_options,
                    explanation, bab, difficulty
                )
            `)
            .eq('exam_session_id', sessionId)
            .order('created_at', { ascending: true });

        if (!session) { content.innerHTML = '<p style="color:red;">Data session tidak ditemukan.</p>'; return; }

        const totalQ = answers?.length || 0;
        const totalCorrect = answers?.filter(a => a.is_correct).length || 0;
        const studentDisplayName = student.nama_lengkap || decodeURIComponent(studentName) || 'Siswa';

        // Header info
        let html = `
            <div style="background:#f9fafb;padding:16px;border-radius:10px;margin-bottom:20px;display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;">
                <div><label style="font-size:0.72rem;color:#6b7280;text-transform:uppercase;">Nama</label>
                    <div style="font-weight:700;color:#1f2937;">${studentDisplayName}</div></div>
                <div><label style="font-size:0.72rem;color:#6b7280;text-transform:uppercase;">Kelas</label>
                    <div style="font-weight:600;">${student.class_name || '-'}</div></div>
                <div><label style="font-size:0.72rem;color:#6b7280;text-transform:uppercase;">Skor</label>
                    <div style="font-weight:700;color:#667eea;font-size:1.3rem;">${session.total_score || 0}</div></div>
                <div><label style="font-size:0.72rem;color:#6b7280;text-transform:uppercase;">Benar / Total</label>
                    <div style="font-weight:600;color:#059669;">${totalCorrect} / ${totalQ}</div></div>
            </div>
            <h4 style="margin-bottom:14px;color:#374151;font-size:0.95rem;">
                <i class="fas fa-list-alt" style="color:#667eea;"></i> Detail Jawaban Per Soal
            </h4>`;

        if (!answers || answers.length === 0) {
            html += '<p style="color:#9ca3af;text-align:center;padding:20px;">Belum ada jawaban tercatat.</p>';
        } else {
            answers.forEach((ans, idx) => {
                const q = ans.questions || {};
                const isCorrect = ans.is_correct;
                const userAns = ans.selected_answer || '-';
                const borderColor = isCorrect ? '#10b981' : '#ef4444';
                const bgColor = isCorrect ? '#f0fdf4' : '#fff5f5';

                // Format jawaban berdasarkan tipe
                let userAnsDisplay = userAns;
                let correctAnsDisplay = q.correct_answer || '-';

                if (q.question_type === 'PGK MCMA') {
                    const opts = (userAns || '').split(',').map(l => l.trim()).filter(Boolean);
                    userAnsDisplay = opts.map(l => `${l}. ${q[`option_${l.toLowerCase()}`] || ''}`).join('<br>') || userAns;
                    const corOpts = Array.isArray(q.correct_answers)
                        ? q.correct_answers
                        : (q.correct_answers || '').split(',');
                    correctAnsDisplay = corOpts.map(l => `${l.trim()}. ${q[`option_${l.trim().toLowerCase()}`] || ''}`).join('<br>');
                } else if (q.question_type === 'PGK Kategori') {
                    try {
                        const selMap = typeof userAns === 'string' ? JSON.parse(userAns) : userAns;
                        let stmts = q.category_options || q.category_statements || [];
                        if (!Array.isArray(stmts)) stmts = typeof stmts === 'string' ? JSON.parse(stmts) : [];
                        userAnsDisplay = stmts.map((s, i) => {
                            const v = selMap[i];
                            return `${i+1}. ${s} → <strong>${v === true ? '✔ Benar' : v === false ? '✘ Salah' : '—'}</strong>`;
                        }).join('<br>');

                        let cm = q.category_mapping || {};
                        if (typeof cm === 'string') cm = JSON.parse(cm);
                        correctAnsDisplay = stmts.map((s, i) => {
                            const key = typeof s === 'string' ? s.trim() : s;
                            const truth = cm.hasOwnProperty(key) ? cm[key] : cm[String(i)];
                            return `${i+1}. ${s} → <strong>${truth ? '✔ Benar' : '✘ Salah'}</strong>`;
                        }).join('<br>');
                    } catch(e) { /* keep raw */ }
                } else {
                    const optKey = `option_${(userAns || '').toLowerCase()}`;
                    if (q[optKey]) userAnsDisplay = `${userAns}. ${q[optKey]}`;
                    const corKey = `option_${(q.correct_answer || '').toLowerCase()}`;
                    if (q[corKey]) correctAnsDisplay = `${q.correct_answer}. ${q[corKey]}`;
                }

                html += `
                <div style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:14px;overflow:hidden;border-left:4px solid ${borderColor};">
                    <div style="background:${bgColor};padding:10px 14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                        <span style="font-weight:700;color:#374151;font-size:0.88rem;">Soal ${idx + 1}</span>
                        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;">
                            <span style="background:${isCorrect ? '#d1fae5' : '#fee2e2'};color:${isCorrect ? '#065f46' : '#991b1b'};padding:2px 10px;border-radius:20px;font-size:0.78rem;font-weight:600;">
                                ${isCorrect ? '✓ Benar' : '✗ Salah'}
                            </span>
                            ${q.question_type ? `<span style="background:#e0e7ff;color:#3730a3;padding:2px 8px;border-radius:12px;font-size:0.75rem;">${q.question_type}</span>` : ''}
                            ${q.bab ? `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:12px;font-size:0.75rem;">${q.bab}</span>` : ''}
                        </div>
                    </div>
                    <div style="padding:12px 14px;">
                        <p style="font-size:0.88rem;color:#374151;margin-bottom:12px;line-height:1.55;">
                            ${q.question_text ? q.question_text.substring(0, 250) + (q.question_text.length > 250 ? '…' : '') : 'Teks soal tidak tersedia.'}
                        </p>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:0.83rem;">
                            <div style="background:${isCorrect ? 'rgba(59,130,246,0.07)' : 'rgba(239,68,68,0.07)'};padding:10px;border-radius:8px;">
                                <div style="color:#6b7280;font-size:0.72rem;margin-bottom:4px;text-transform:uppercase;font-weight:600;">Jawaban Siswa</div>
                                <div style="color:#1f2937;font-weight:500;line-height:1.5;">${userAnsDisplay}</div>
                            </div>
                            <div style="background:rgba(16,185,129,0.07);padding:10px;border-radius:8px;">
                                <div style="color:#6b7280;font-size:0.72rem;margin-bottom:4px;text-transform:uppercase;font-weight:600;">Jawaban Benar</div>
                                <div style="color:#065f46;font-weight:600;line-height:1.5;">${correctAnsDisplay}</div>
                            </div>
                        </div>
                        ${q.explanation ? `
                        <div style="margin-top:10px;background:#fffbeb;border-left:3px solid #f59e0b;padding:10px 12px;border-radius:0 8px 8px 0;">
                            <div style="font-size:0.75rem;color:#92400e;font-weight:700;margin-bottom:4px;">
                                <i class="fas fa-lightbulb"></i> Pembahasan
                            </div>
                            <div style="font-size:0.83rem;color:#374151;line-height:1.55;">${q.explanation}</div>
                        </div>` : ''}
                    </div>
                </div>`;
            });
        }

        content.innerHTML = html;

    } catch(err) {
        content.innerHTML = `<p style="color:red;padding:20px;">Gagal memuat data: ${err.message}</p>`;
    }
};

window.loadFullSummaryTable = loadFullSummaryTable;