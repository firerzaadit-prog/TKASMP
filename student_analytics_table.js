// student_analytics_table.js - Manajer tabel detail siswa untuk dashboard analytics
import { supabase } from './supabaseClient.js';

/**
 * Class untuk mengelola tabel detail siswa di dashboard analytics
 * Menampilkan: NAMA | KELAS | RATA RATA SKOR | JUMLAH UJIAN | CLUSTER | PREDIKSI SELANJUTNYA | AKSI
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
                        lastExamDate: null
                    });
                }

                const student = studentMap.get(studentId);
                student.exams.push(exam);
                student.totalScore += exam.total_score || 0;
                student.examCount++;

                // Track tanggal ujian terakhir
                const examDate = new Date(exam.created_at);
                if (!student.lastExamDate || examDate > student.lastExamDate) {
                    student.lastExamDate = examDate;
                }
            });

            // Hitung rata-rata dan tentukan cluster + trend
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
     * @param {Object} student - Data siswa
     * @returns {string} HTML row
     */
    createTableRow(student) {
        const predictionText = this.getPredictionText(student);
        const clusterDisplay = this.getClusterDisplay(student.cluster);

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
                <td class="student-actions">
                    <button onclick="showStudentDetail('${student.id}')" class="action-btn detail-btn" title="Lihat detail siswa">
                        <i class="fas fa-eye"></i> Detail
                    </button>
                </td>
            </tr>
        `;
    }

    /**
     * Dapatkan teks prediksi berdasarkan cluster siswa
     * @param {Object} student - Data siswa
     * @returns {string} Teks prediksi
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
     * @param {string} cluster - Nama cluster
     * @returns {string} Display text
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
     * @returns {Array} Data yang sudah difilter
     */
    applyFilters() {
        return this.studentsData.filter(student => {
            // Filter kelas
            if (this.filters.class !== 'all' && student.class !== this.filters.class) {
                return false;
            }

            // Filter cluster
            if (this.filters.cluster !== 'all' && student.cluster !== this.filters.cluster) {
                return false;
            }

            // Filter skor
            if (student.avgScore < this.filters.minScore || student.avgScore > this.filters.maxScore) {
                return false;
            }

            return true;
        });
    }

    /**
     * Terapkan sorting ke data siswa
     * @param {Array} data - Data yang akan di-sort
     * @returns {Array} Data yang sudah di-sort
     */
    applySorting(data) {
        return data.sort((a, b) => {
            let aValue = a[this.sortColumn];
            let bValue = b[this.sortColumn];

            // Handle string comparison
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
            }

            if (this.sortDirection === 'asc') {
                return aValue > bValue ? 1 : aValue < bValue ? -1 : 0;
            } else {
                return aValue < bValue ? 1 : aValue > bValue ? -1 : 0;
            }
        });
    }

    /**
     * Set sorting untuk kolom tertentu
     * @param {string} column - Nama kolom
     * @param {string} direction - 'asc' atau 'desc'
     */
    setSorting(column, direction = 'desc') {
        this.sortColumn = column;
        this.sortDirection = direction;
        this.renderTable();
    }

    /**
     * Set filter untuk data
     * @param {Object} filters - Object filter
     */
    setFilters(filters) {
        this.filters = { ...this.filters, ...filters };
        this.currentPage = 1; // Reset ke halaman pertama
        this.renderTable();
    }

    /**
     * Update informasi pagination
     * @param {number} totalItems - Total item
     */
    updatePaginationInfo(totalItems) {
        const totalPages = Math.ceil(totalItems / this.itemsPerPage);
        const startItem = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, totalItems);

        // Update elemen pagination jika ada
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
     * @param {number} totalPages - Total halaman
     * @returns {string} HTML kontrol pagination
     */
    createPaginationControls(totalPages) {
        let controls = '';

        // Previous button
        controls += `<button onclick="studentTable.goToPage(${this.currentPage - 1})" ${this.currentPage <= 1 ? 'disabled' : ''}>
            <i class="fas fa-chevron-left"></i>
        </button>`;

        // Page numbers
        const startPage = Math.max(1, this.currentPage - 2);
        const endPage = Math.min(totalPages, this.currentPage + 2);

        for (let i = startPage; i <= endPage; i++) {
            controls += `<button onclick="studentTable.goToPage(${i})" class="${i === this.currentPage ? 'active' : ''}">${i}</button>`;
        }

        // Next button
        controls += `<button onclick="studentTable.goToPage(${this.currentPage + 1})" ${this.currentPage >= totalPages ? 'disabled' : ''}>
            <i class="fas fa-chevron-right"></i>
        </button>`;

        return controls;
    }

    /**
     * Pindah ke halaman tertentu
     * @param {number} page - Nomor halaman
     */
    goToPage(page) {
        if (page >= 1 && page <= Math.ceil(this.studentsData.length / this.itemsPerPage)) {
            this.currentPage = page;
            this.renderTable();
        }
    }

    /**
     * Export data siswa ke CSV
     * @returns {string} CSV content
     */
    exportToCSV() {
        const headers = ['Nama Siswa', 'Kelas', 'Rata-rata Skor', 'Jumlah Ujian', 'Cluster', 'Prediksi Selanjutnya'];
        const rows = this.studentsData.map(student => [
            student.name,
            student.class,
            student.avgScore.toFixed(1),
            student.examCount,
            this.getClusterDisplay(student.cluster),
            this.getPredictionText(student)
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(field => `"${field}"`).join(','))
            .join('\n');

        // Download file
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
     * @param {string} query - Kata kunci pencarian
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

        // Render hasil pencarian (sementara override pagination)
        const table = document.getElementById(this.tableId);
        const tbody = table.querySelector('tbody');
        tbody.innerHTML = filteredData.slice(0, this.itemsPerPage).map(student => this.createTableRow(student)).join('');

        // Update info
        const paginationInfo = document.getElementById('paginationInfo');
        if (paginationInfo) {
            paginationInfo.textContent = `Ditemukan ${filteredData.length} siswa untuk "${query}"`;
        }
    }

    /**
     * Escape HTML untuk keamanan
     * @param {string} text - Text yang akan di-escape
     * @returns {string} Text yang sudah di-escape
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
     * @returns {Object} Statistik
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
    // Import showStudentDetail dari analytics.js jika diperlukan
    if (window.showStudentDetailFromAnalytics) {
        window.showStudentDetailFromAnalytics(studentId);
    } else {
        console.log(`Show detail for student: ${studentId}`);
        // Implementasi fallback atau import dinamis
    }
};

// Contoh penggunaan:
/*
// Inisialisasi
await studentTable.loadStudentsData();
studentTable.renderTable('studentsTable');

// Set filter
studentTable.setFilters({ class: '7A', cluster: 'high-performer' });

// Set sorting
studentTable.setSorting('avgScore', 'desc');

// Pencarian
studentTable.searchStudents('john');

// Export
studentTable.exportToCSV();

// Refresh data
await studentTable.refresh();

// Get statistik
const stats = studentTable.getSummaryStats();
console.log(`Total siswa: ${stats.totalStudents}, Rata-rata skor: ${stats.averageScore}%`);
*/