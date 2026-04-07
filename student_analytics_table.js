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
     * ✅ PERBAIKAN: Sekarang juga mengambil data gemini_analyses untuk kolom AI
     * @returns {Promise<Array>} Array data siswa
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

            // ✅ BARU: Ambil semua data analisis AI dari gemini_analyses
            // Join ke exam_answers → exam_sessions untuk mendapatkan user_id
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

            // ✅ BARU: Kelompokkan semua analisis AI per user_id
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
                        // ✅ BARU: field untuk data AI
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
                // Hitung rata-rata skor
                student.avgScore = student.examCount > 0 ? student.totalScore / student.examCount : 0;

                // Tentukan cluster berdasarkan skor rata-rata
                if (student.avgScore >= 80) {
                    student.cluster = 'high-performer';
                } else if (student.avgScore >= 60) {
                    student.cluster = 'average';
                } else {
                    student.cluster = 'struggling';
                }

                // Hitung trend berdasarkan 2 ujian terakhir
                if (student.exams.length >= 2) {
                    const recentExams = student.exams
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                        .slice(0, 2);
                    const trend = recentExams[0].total_score - recentExams[1].total_score;
                    student.trend = trend > 5 ? 'improving' : trend < -5 ? 'declining' : 'stable';
                }

                // ✅ BARU: Masukkan data AI ke object student
                const ai = aiByUser[student.id];
                if (ai) {
                    // Ambil ringkasan terakhir (paling relevan / terbaru)
                    student.aiSummary = ai.summaries.length > 0
                        ? ai.summaries[ai.summaries.length - 1]
                        : '-';
                    // Dedup dan batasi maksimal 3 item unik agar tabel tidak terlalu panjang
                    student.aiStrengths   = [...new Set(ai.strengths)].slice(0, 3);
                    student.aiWeaknesses  = [...new Set(ai.weaknesses)].slice(0, 3);
                    student.aiSuggestions = [...new Set(ai.suggestions)].slice(0, 3);
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

    /**
     * Render tabel siswa ke DOM
     * @param {string} containerId - ID container tabel
     */
    renderTable(containerId = this.tableId) {
        const table = document.getElementById(containerId);
        if (!table) {
            console.error(`[StudentAnalyticsTable] Table with id '${containerId}' not found`);
            return;
        }

        const tbody = table.querySelector('tbody');
        if (!tbody) {
            console.error(`[StudentAnalyticsTable] Table body not found in '${containerId}'`);
            return;
        }

        // Filter dan sort data
        let filteredData = this.applyFilters();
        filteredData = this.applySorting(filteredData);

        // Pagination
        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = startIndex + this.itemsPerPage;
        const paginatedData = filteredData.slice(startIndex, endIndex);

        // Render rows
        tbody.innerHTML = paginatedData.map(student => this.createTableRow(student)).join('');

        // Update info pagination
        this.updatePaginationInfo(filteredData.length);

        console.log(`[StudentAnalyticsTable] Rendered ${paginatedData.length} students in table`);
    }

    /**
     * Buat HTML row untuk satu siswa
     * ✅ PERBAIKAN: Tambahkan 4 kolom AI (Ringkasan AI, Kekuatan, Kelemahan, Rekomendasi)
     * @param {Object} student - Data siswa
     * @returns {string} HTML row
     */
    createTableRow(student) {
        const predictionText = this.getPredictionText(student);
        const clusterDisplay = this.getClusterDisplay(student.cluster);

        // ✅ BARU: Helper untuk merender list AI sebagai bullet points
        const renderAiList = (items) => {
            if (!items || items.length === 0) return '<span style="color:#9ca3af;font-style:italic;">-</span>';
            return '<ul style="margin:0;padding-left:16px;font-size:0.78rem;color:#374151;">'
                + items.map(i => `<li style="margin-bottom:3px;">${this.escapeHtml(i)}</li>`).join('')
                + '</ul>';
        };

        // ✅ BARU: Render ringkasan AI
        const aiSummaryHtml = (student.aiSummary && student.aiSummary !== '-')
            ? `<span style="font-size:0.78rem;color:#374151;line-height:1.4;">${this.escapeHtml(student.aiSummary)}</span>`
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

                <!-- ✅ 4 KOLOM AI BARU -->
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

    /**
     * Dapatkan teks prediksi berdasarkan cluster siswa
     */
    getPredictionText(student) {
        const predictions = {
            'high-performer': 'Akan terus excellent',
            'average': 'Berpotensi meningkat',
            'struggling': 'Perlu intervensi'
        };
        return predictions[student.cluster] || 'Unknown';
    }

    /**
     * Dapatkan display text untuk cluster
     */
    getClusterDisplay(cluster) {
        const displays = {
            'high-performer': 'Berprestasi Tinggi',
            'average': 'Sedang',
            'struggling': 'Perlu Bantuan'
        };
        return displays[cluster] || cluster.replace('-', ' ');
    }

    /**
     * Terapkan filter ke data siswa
     */
    applyFilters() {
        return this.studentsData.filter(student => {
            if (this.filters.class !== 'all' && student.class !== this.filters.class) return false;
            if (this.filters.cluster !== 'all' && student.cluster !== this.filters.cluster) return false;
            if (student.avgScore < this.filters.minScore || student.avgScore > this.filters.maxScore) return false;
            return true;
        });
    }

    /**
     * Terapkan sorting ke data siswa
     */
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

    /**
     * Set sorting kolom
     */
    setSorting(column, direction = 'desc') {
        this.sortColumn = column;
        this.sortDirection = direction;
        this.renderTable();
    }

    /**
     * Set filter untuk data
     */
    setFilters(filters) {
        this.filters = { ...this.filters, ...filters };
        this.currentPage = 1;
        this.renderTable();
    }

    /**
     * Update informasi pagination
     */
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

    /**
     * Buat kontrol pagination
     */
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

    /**
     * Pindah ke halaman tertentu
     */
    goToPage(page) {
        if (page >= 1 && page <= Math.ceil(this.studentsData.length / this.itemsPerPage)) {
            this.currentPage = page;
            this.renderTable();
        }
    }

    /**
     * Export data siswa ke CSV (termasuk kolom AI)
     */
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

    /**
     * Cari siswa berdasarkan nama
     */
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

    /**
     * Escape HTML untuk keamanan
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Refresh data dan render ulang tabel
     */
    async refresh() {
        await this.loadStudentsData();
        this.renderTable();
    }

    /**
     * Get statistik ringkasan siswa
     */
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

// Export class dan instance global
export { StudentAnalyticsTable };

// Instance global untuk digunakan di HTML
export const studentTable = new StudentAnalyticsTable();

// Fungsi utility untuk global scope
window.showStudentDetail = async function(studentId) {
    if (window.showStudentDetailFromAnalytics) {
        window.showStudentDetailFromAnalytics(studentId);
    } else {
        console.log(`Show detail for student: ${studentId}`);
    }
};
