// ai_viewer.js - Halaman mandiri untuk menampilkan Analisis AI
// REFACTORED: Hanya membaca (SELECT) dari tabel gemini_analyses.
// TIDAK memanggil Gemini API sama sekali.

import { supabase } from './clientSupabase.js';

// ────────────────────────────────────────────────
// Helpers UI
// ────────────────────────────────────────────────
function setStatus(text, state = 'loading') {
    const dot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    if (dot) {
        dot.className = 'status-dot';
        if (state === 'loading') dot.classList.add('loading');
        else if (state === 'error') dot.classList.add('error');
        // 'done' → hijau default
    }
    if (statusText) statusText.textContent = text;
}

function showError(title, message) {
    const loadingCard = document.getElementById('aiLoadingCard');
    if (loadingCard) loadingCard.style.display = 'none';

    const errCard = document.getElementById('aiErrorCard');
    if (errCard) errCard.style.display = 'block';

    const errTitle = document.getElementById('errorTitle');
    if (errTitle) errTitle.textContent = title;

    const errMsg = document.getElementById('errorMessage');
    if (errMsg) errMsg.textContent = message;

    setStatus('Gagal memuat analisis', 'error');
}

/**
 * Tampilkan pesan khusus ketika analisis belum tersedia di database.
 * Berbeda dengan showError — ini bukan error teknis, hanya belum diproses.
 */
function showPendingMessage() {
    const loadingCard = document.getElementById('aiLoadingCard');
    if (loadingCard) loadingCard.style.display = 'none';

    // Cek apakah ada elemen pending khusus, jika tidak pakai errCard
    const pendingCard = document.getElementById('aiPendingCard');
    if (pendingCard) {
        pendingCard.style.display = 'block';
        setStatus('Menunggu diproses admin', 'loading');
        return;
    }

    // Fallback: gunakan errCard dengan pesan custom
    const errCard = document.getElementById('aiErrorCard');
    if (errCard) {
        errCard.style.display = 'block';
        errCard.style.borderColor = '#f59e0b';
        errCard.style.background = 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)';
    }

    const errTitle = document.getElementById('errorTitle');
    if (errTitle) {
        errTitle.textContent = '⏳ Analisis Belum Tersedia';
        errTitle.style.color = '#d97706';
    }

    const errMsg = document.getElementById('errorMessage');
    if (errMsg) {
        errMsg.innerHTML = `
            Analisis AI untuk sesi ujian ini belum tersedia. 
            <br><br>
            <strong>Apa yang terjadi?</strong><br>
            Guru/admin sedang memproses analisis AI untuk hasil ujianmu. 
            Proses ini biasanya memakan waktu beberapa saat setelah ujian selesai.
            <br><br>
            Silakan kembali ke <a href="halamanpertama.html" style="color:#2563eb;font-weight:600;">Halaman Utama</a> 
            dan cek kembali nanti melalui menu <strong>Riwayat Ujian</strong>.
        `;
    }

    // Sembunyikan tombol retry jika ada
    const retryBtn = document.querySelector('#aiErrorCard button[onclick*="retry"]');
    if (retryBtn) retryBtn.style.display = 'none';

    setStatus('Menunggu diproses admin', 'loading');
}

function setLoadingDetail(text) {
    const el = document.getElementById('loadingDetail');
    if (el) el.textContent = text;
}

// ────────────────────────────────────────────────
// Render hasil analisis AI ke DOM
// ────────────────────────────────────────────────
function renderGlobalAiAnalysis(data, analyticsData) {
    const container = document.getElementById('aiAnalysisContent');
    if (!container) return;

    // ── Matriks kognitif (bab × level) ──────────────────
    let matrixHtml = '';
    if (analyticsData && analyticsData.levelKognitif) {
        const CHAPTERS = ['Bilangan', 'Aljabar', 'Geometri & Pengukuran', 'Data dan Peluang'];
        const LEVELS = ['Level 1', 'Level 2', 'Level 3'];
        const matrix = analyticsData.levelKognitif;

        const rows = CHAPTERS.map(bab => {
            let totalBenar = 0, totalSalah = 0;
            const cells = LEVELS.map(lv => {
                const cell = (matrix[bab] && matrix[bab][lv]) || { benar: 0, salah: 0 };
                totalBenar += cell.benar;
                totalSalah += cell.salah;
                if (cell.benar === 0 && cell.salah === 0) {
                    return `<td><span style="color:#d1d5db;">—</span></td>`;
                }
                return `<td>
                    <span class="cell-correct">${cell.benar}</span>
                    <span style="color:#9ca3af;margin:0 2px;">/</span>
                    <span class="cell-wrong">${cell.salah}</span>
                </td>`;
            }).join('');

            const hasData = totalBenar > 0 || totalSalah > 0;
            return `<tr>
                <td>${bab}</td>
                ${cells}
                <td>${hasData ? `<span class="cell-total">${totalBenar + totalSalah}</span> <span style="font-size:0.75rem;color:#9ca3af;">(${totalBenar}✓)</span>` : '<span style="color:#d1d5db;">—</span>'}</td>
            </tr>`;
        }).join('');

        matrixHtml = `
        <div class="cognitive-matrix-card">
            <h4><i class="fas fa-table"></i> Matriks Performa Kognitif</h4>
            <p style="font-size:0.82rem;color:#9ca3af;margin-bottom:14px;">Format sel: <strong style="color:#059669;">Benar</strong> / <strong style="color:#dc2626;">Salah</strong></p>
            <div class="matrix-table-wrap">
                <table class="matrix-table">
                    <thead>
                        <tr>
                            <th>Bab / Materi</th>
                            <th>Level 1<br><span style="font-weight:400;font-size:0.75rem;">Pengetahuan</span></th>
                            <th>Level 2<br><span style="font-weight:400;font-size:0.75rem;">Aplikasi</span></th>
                            <th>Level 3<br><span style="font-weight:400;font-size:0.75rem;">Penalaran</span></th>
                            <th>Total</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
    }

    // Tanggal analisis
    const analyzedAt = data.analyzed_at
        ? new Date(data.analyzed_at).toLocaleString('id-ID', {
            day: 'numeric', month: 'long', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
          })
        : null;

    container.innerHTML = `
        <!-- Info waktu analisis -->
        ${analyzedAt ? `
        <div style="text-align:right;margin-bottom:8px;">
            <span style="font-size:0.78rem;color:#9ca3af;"><i class="fas fa-clock"></i> Dianalisis: ${analyzedAt}</span>
        </div>` : ''}

        <!-- Ringkasan -->
        <div class="ai-summary-card">
            <h3><i class="fas fa-info-circle"></i> Ringkasan Evaluasi</h3>
            <p>${data.summary || 'Tidak ada ringkasan tersedia.'}</p>
        </div>

        <!-- Kekuatan & Kelemahan -->
        <div class="ai-details-grid">
            <div class="detail-card strengths">
                <h4><i class="fas fa-check-circle"></i> Kekuatan</h4>
                <ul>
                    ${(data.strengths || []).length > 0
                        ? (data.strengths).map(s => `<li>${s}</li>`).join('')
                        : '<li style="color:#9ca3af;">Data belum tersedia.</li>'}
                </ul>
            </div>
            <div class="detail-card weaknesses">
                <h4><i class="fas fa-exclamation-circle"></i> Area Perbaikan</h4>
                <ul>
                    ${(data.weaknesses || []).length > 0
                        ? (data.weaknesses).map(w => `<li>${w}</li>`).join('')
                        : '<li style="color:#9ca3af;">Data belum tersedia.</li>'}
                </ul>
            </div>
        </div>

        <!-- Matriks Kognitif -->
        ${matrixHtml}

        <!-- Saran Pembelajaran -->
        <div class="ai-suggestion-card">
            <h4><i class="fas fa-lightbulb"></i> Saran Pembelajaran Personal</h4>
            ${(data.learningSuggestions || []).length > 0
                ? (data.learningSuggestions).map(ls => `
                    <div class="suggestion-item">
                        <i class="fas fa-arrow-right"></i>
                        <span>${ls}</span>
                    </div>`).join('')
                : '<div class="suggestion-item"><i class="fas fa-info-circle"></i><span style="color:#9ca3af;">Saran belum tersedia.</span></div>'
            }
        </div>
    `;

    container.style.display = 'block';
    setStatus('Analisis selesai', 'done');
}

// ────────────────────────────────────────────────
// Helper: hitung matriks kognitif dari data jawaban
// (digunakan jika data tersimpan masih perlu di-compute ulang)
// ────────────────────────────────────────────────
function buildCognitiveMatrix(analysisData) {
    // Jika data sudah menyimpan levelKognitif, gunakan langsung
    if (analysisData.levelKognitif) {
        return { levelKognitif: analysisData.levelKognitif };
    }
    return null;
}

// ────────────────────────────────────────────────
// Fungsi utama: HANYA baca dari database
// ────────────────────────────────────────────────
async function loadAIAnalysisFromDB(sessionId) {
    try {
        setStatus('Mengambil data analisis dari database…', 'loading');
        setLoadingDetail('Menghubungkan ke database…');

        // Query ke tabel gemini_analyses berdasarkan session ID
        const { data: analysisRecord, error } = await supabase
            .from('gemini_analyses')
            .select('analysis_data, updated_at')
            .eq('answer_id', sessionId)
            .maybeSingle();

        if (error) {
            console.error('[AI Viewer] DB error:', error);
            showError(
                'Gagal Mengambil Data',
                'Terjadi kesalahan saat mengambil data dari database. Silakan coba lagi nanti. (' + error.message + ')'
            );
            return;
        }

        // Jika data tidak ada → analisis belum diproses admin
        if (!analysisRecord || !analysisRecord.analysis_data) {
            console.log('[AI Viewer] Analisis belum tersedia untuk session:', sessionId);
            showPendingMessage();
            return;
        }

        const analysisData = analysisRecord.analysis_data;
        console.log('[AI Viewer] Data analisis ditemukan:', analysisData);

        setLoadingDetail('Merender hasil analisis…');

        // Sembunyikan loading card
        const loadingCard = document.getElementById('aiLoadingCard');
        if (loadingCard) loadingCard.style.display = 'none';

        // Tambahkan timestamp ke analysisData jika ada
        if (analysisRecord.updated_at && !analysisData.analyzed_at) {
            analysisData.analyzed_at = analysisRecord.updated_at;
        }

        // Render ke UI
        const extraData = buildCognitiveMatrix(analysisData);
        renderGlobalAiAnalysis(analysisData, extraData);

    } catch (err) {
        console.error('[AI Viewer] Error:', err);
        showError('Gagal Memuat Analisis', err.message || 'Terjadi kesalahan yang tidak diketahui.');
    }
}

// ────────────────────────────────────────────────
// Entry point — jalankan saat DOM siap
// ────────────────────────────────────────────────
let _sessionId = null;
let _userId = null;

document.addEventListener('DOMContentLoaded', async () => {
    const params = new URLSearchParams(window.location.search);
    _sessionId = params.get('session');
    _userId = params.get('user');

    // Update status bar
    const statusSession = document.getElementById('statusSession');
    if (statusSession) {
        statusSession.textContent = _sessionId ? _sessionId.slice(0, 12) + '…' : 'Tidak ada';
    }

    // Update header subtitle
    const subtitle = document.getElementById('headerSubtitle');
    if (subtitle) {
        subtitle.textContent = _sessionId
            ? `Sesi ujian: ${_sessionId.slice(0, 8)}…`
            : 'Parameter tidak valid';
    }

    // Validasi parameter
    if (!_sessionId || _sessionId === 'null' || _sessionId === 'undefined') {
        showError(
            'Parameter URL Tidak Valid',
            'ID sesi ujian tidak ditemukan di URL. Silakan kembali ke halaman utama dan buka analisis melalui menu Riwayat Ujian.'
        );
        return;
    }

    // REFACTORED: Hanya baca dari DB, tidak panggil Gemini API
    await loadAIAnalysisFromDB(_sessionId);
});

// Tombol kembali ke halaman utama (global)
window.goToHomePage = function () {
    window.location.href = 'halamanpertama.html';
};

// Refresh: coba baca ulang dari DB (bukan retry API)
window.retryAnalysis = async function () {
    const errCard = document.getElementById('aiErrorCard');
    if (errCard) {
        errCard.style.display = 'none';
        errCard.style.borderColor = '';
        errCard.style.background = '';
    }

    const pendingCard = document.getElementById('aiPendingCard');
    if (pendingCard) pendingCard.style.display = 'none';

    const loadingCard = document.getElementById('aiLoadingCard');
    if (loadingCard) loadingCard.style.display = 'block';

    const content = document.getElementById('aiAnalysisContent');
    if (content) {
        content.style.display = 'none';
        content.innerHTML = '';
    }

    const errTitle = document.getElementById('errorTitle');
    if (errTitle) errTitle.style.color = '';

    const retryBtn = document.querySelector('#aiErrorCard button[onclick*="retry"]');
    if (retryBtn) retryBtn.style.display = '';

    setStatus('Memeriksa ulang database…', 'loading');
    await loadAIAnalysisFromDB(_sessionId);
};