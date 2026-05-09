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
function renderGlobalAiAnalysis(data, analyticsData, babMap) {
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

        <!-- Peta Kompetensi -->
        ${renderPetaKompetensi(babMap)}

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
// Peta Kompetensi: ambil jawaban dari exam_answers
// lalu hitung benar/salah/kosong per bab
// ────────────────────────────────────────────────
async function fetchPetaKompetensi(sessionId) {
    try {
        const { data: answerRows, error } = await supabase
            .from('exam_answers')
            .select(`
                is_correct, selected_answer, user_answer,
                questions:question_id (bab, chapter, question_type, correct_answer, correct_answers, category_mapping, level, cognitive_level, nomor_soal, question_number)
            `)
            .eq('exam_session_id', sessionId)
            .order('created_at', { ascending: true });

        if (error || !answerRows || answerRows.length === 0) return null;

        const babMap = {};
        answerRows.forEach((row, idx) => {
            const q = row.questions;
            if (!q) return;
            const bab   = (q.bab || q.chapter || 'Lainnya').trim();
            const level = (q.level || q.cognitive_level || '').trim() || 'Tanpa Level';
            // Nomor soal: ambil dari field DB jika ada, fallback ke urutan
            const nomorSoal = q.nomor_soal || q.question_number || (idx + 1);

            if (!babMap[bab]) babMap[bab] = { total: 0, benar: 0, salah: 0, kosong: 0, levels: {} };
            if (!babMap[bab].levels[level]) babMap[bab].levels[level] = { soal: [] };

            const answer = row.selected_answer ?? row.user_answer ?? null;
            babMap[bab].total++;

            if (!answer || answer === '') {
                babMap[bab].kosong++;
                babMap[bab].levels[level].soal.push({ no: nomorSoal, status: 'kosong' });
                return;
            }

            // Gunakan is_correct dari DB jika tersedia
            let isCorrect = null;
            if (row.is_correct === true) isCorrect = true;
            else if (row.is_correct === false) isCorrect = false;
            else {
                // Fallback hitung manual
                try {
                    if (q.question_type === 'PGK MCMA') {
                        const sel = answer.split(',').sort();
                        const cor = Array.isArray(q.correct_answers)
                            ? q.correct_answers.sort()
                            : (q.correct_answers || '').split(',').sort();
                        isCorrect = JSON.stringify(sel) === JSON.stringify(cor);
                    } else if (q.question_type === 'PGK Kategori') {
                        const sel = typeof answer === 'string' ? JSON.parse(answer) : answer;
                        const map = typeof q.category_mapping === 'string' ? JSON.parse(q.category_mapping) : q.category_mapping;
                        if (map && sel) {
                            let ok = true;
                            for (const [k, v] of Object.entries(sel)) { if (map[k] !== v) { ok = false; break; } }
                            for (const [k, v] of Object.entries(map)) { if (v && sel[k] !== true) { ok = false; break; } }
                            isCorrect = ok;
                        } else { isCorrect = false; }
                    } else {
                        isCorrect = answer === q.correct_answer;
                    }
                } catch(e) { isCorrect = false; }
            }

            if (isCorrect) {
                babMap[bab].benar++;
                babMap[bab].levels[level].soal.push({ no: nomorSoal, status: 'benar' });
            } else {
                babMap[bab].salah++;
                babMap[bab].levels[level].soal.push({ no: nomorSoal, status: 'salah' });
            }
        });

        return Object.keys(babMap).length > 0 ? babMap : null;
    } catch(e) {
        console.warn('[PetaKompetensi] Error:', e);
        return null;
    }
}

// ────────────────────────────────────────────────
// Render Peta Kompetensi ke dalam container
// ────────────────────────────────────────────────
function renderPetaKompetensi(babMap) {
    if (!babMap) return '';

    const babs = Object.keys(babMap).sort();
    if (babs.length === 0) return '';

    // Helper: render pills nomor soal
    function renderSoalPills(soalArr) {
        // Urutkan berdasarkan nomor soal
        const sorted = [...soalArr].sort((a, b) => Number(a.no) - Number(b.no));
        return sorted.map(s => {
            if (s.status === 'benar') {
                return `<span title="Soal No. ${s.no} — Benar" style="
                    display:inline-flex;align-items:center;justify-content:center;
                    min-width:28px;height:24px;padding:0 6px;
                    background:#d1fae5;color:#065f46;
                    border:1.5px solid #6ee7b7;border-radius:6px;
                    font-size:0.72rem;font-weight:700;cursor:default;">${s.no}✓</span>`;
            } else if (s.status === 'salah') {
                return `<span title="Soal No. ${s.no} — Salah" style="
                    display:inline-flex;align-items:center;justify-content:center;
                    min-width:28px;height:24px;padding:0 6px;
                    background:#fee2e2;color:#991b1b;
                    border:1.5px solid #fca5a5;border-radius:6px;
                    font-size:0.72rem;font-weight:700;cursor:default;">${s.no}✗</span>`;
            } else {
                return `<span title="Soal No. ${s.no} — Tidak Dijawab" style="
                    display:inline-flex;align-items:center;justify-content:center;
                    min-width:28px;height:24px;padding:0 6px;
                    background:#f3f4f6;color:#9ca3af;
                    border:1.5px solid #e5e7eb;border-radius:6px;
                    font-size:0.72rem;font-weight:700;cursor:default;">${s.no}—</span>`;
            }
        }).join(' ');
    }

    const levelOrder = ['Level 1','Level 2','Level 3'];

    const rows = babs.map(bab => {
        const d = babMap[bab];
        const pct = d.total > 0 ? Math.round((d.benar / d.total) * 100) : 0;
        const barColor   = pct >= 70 ? '#059669' : pct >= 50 ? '#d97706' : '#dc2626';
        const bgLabel    = pct >= 70 ? '#d1fae5' : pct >= 50 ? '#fef3c7' : '#fee2e2';
        const labelColor = pct >= 70 ? '#065f46' : pct >= 50 ? '#92400e' : '#991b1b';
        const emoji      = pct >= 70 ? '✅' : pct >= 50 ? '⚠️' : '❌';
        const label      = pct >= 70 ? 'Baik' : pct >= 50 ? 'Cukup' : 'Perlu Latihan';

        // Render level rows (jika ada data level)
        const levels = d.levels ? Object.keys(d.levels).sort((a, b) => {
            const ia = levelOrder.indexOf(a), ib = levelOrder.indexOf(b);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1; if (ib !== -1) return 1;
            return a.localeCompare(b);
        }) : [];

        const levelRows = levels.map(lv => {
            const soalArr = d.levels[lv].soal;
            const lvBenar  = soalArr.filter(s => s.status === 'benar').length;
            const lvSalah  = soalArr.filter(s => s.status === 'salah').length;
            const lvKosong = soalArr.filter(s => s.status === 'kosong').length;
            const lvLabel  = lv === 'Level 1' ? 'Pengetahuan'
                           : lv === 'Level 2' ? 'Aplikasi'
                           : lv === 'Level 3' ? 'Penalaran' : '';
            return `
            <div style="margin-top:10px;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
                    <span style="font-size:0.78rem;font-weight:700;color:#4f46e5;background:#ede9fe;padding:2px 8px;border-radius:20px;">
                        ${lv}${lvLabel ? ' · ' + lvLabel : ''}
                    </span>
                    <span style="font-size:0.75rem;color:#059669;font-weight:600;">✔ ${lvBenar} benar</span>
                    <span style="font-size:0.75rem;color:#dc2626;font-weight:600;">✘ ${lvSalah} salah</span>
                    ${lvKosong > 0 ? `<span style="font-size:0.75rem;color:#9ca3af;font-weight:600;">— ${lvKosong} kosong</span>` : ''}
                </div>
                <div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;">
                    ${renderSoalPills(soalArr)}
                </div>
            </div>`;
        }).join('');

        return `
        <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:14px;padding:16px 18px;margin-bottom:14px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:1.1rem;">${emoji}</span>
                    <span style="font-weight:700;color:#1f2937;font-size:0.92rem;">${bab}</span>
                </div>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <span style="color:#059669;font-size:0.8rem;font-weight:600;">✔ ${d.benar} Benar</span>
                    <span style="color:#dc2626;font-size:0.8rem;font-weight:600;">✘ ${d.salah} Salah</span>
                    ${(d.kosong || 0) > 0 ? `<span style="color:#9ca3af;font-size:0.8rem;font-weight:600;">— ${d.kosong} Kosong</span>` : ''}
                    <span style="background:${bgLabel};color:${labelColor};padding:2px 10px;border-radius:20px;font-size:0.72rem;font-weight:700;">${label}</span>
                </div>
            </div>
            <div style="background:#e5e7eb;border-radius:999px;height:8px;overflow:hidden;">
                <div style="width:${pct}%;height:100%;background:${barColor};border-radius:999px;"></div>
            </div>
            <div style="text-align:right;font-size:0.72rem;color:#6b7280;margin-top:4px;">${pct}% benar dari ${d.total} soal</div>
            ${levelRows}
        </div>`;
    }).join('');

    return `
    <div class="peta-kompetensi-card" style="background:#fff;border-radius:16px;padding:28px;box-shadow:0 4px 20px rgba(0,0,0,0.06);margin-bottom:24px;border-top:4px solid #7c3aed;">
        <h4 style="font-size:1rem;font-weight:700;color:#374151;margin-bottom:6px;display:flex;align-items:center;gap:8px;">
            <i class="fas fa-map" style="color:#7c3aed;"></i> Peta Kompetensi
        </h4>
        <p style="font-size:0.8rem;color:#9ca3af;margin-bottom:18px;">Performa per bab berdasarkan sesi ujian ini</p>
        ${rows}
        <!-- Legenda -->
        <div style="padding:12px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">
            <div style="font-size:0.78rem;font-weight:700;color:#374151;margin-bottom:8px;">Keterangan Nomor Soal:</div>
            <div style="display:flex;gap:14px;flex-wrap:wrap;align-items:center;">
                <span style="display:inline-flex;align-items:center;gap:5px;font-size:0.77rem;color:#065f46;">
                    <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:22px;background:#d1fae5;color:#065f46;border:1.5px solid #6ee7b7;border-radius:6px;font-size:0.7rem;font-weight:700;">7✓</span> Benar
                </span>
                <span style="display:inline-flex;align-items:center;gap:5px;font-size:0.77rem;color:#991b1b;">
                    <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:22px;background:#fee2e2;color:#991b1b;border:1.5px solid #fca5a5;border-radius:6px;font-size:0.7rem;font-weight:700;">3✗</span> Salah
                </span>
                <span style="display:inline-flex;align-items:center;gap:5px;font-size:0.77rem;color:#6b7280;">
                    <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:22px;background:#f3f4f6;color:#9ca3af;border:1.5px solid #e5e7eb;border-radius:6px;font-size:0.7rem;font-weight:700;">5—</span> Tidak Dijawab
                </span>
                <span style="font-size:0.75rem;color:#6b7280;">| Angka = nomor soal</span>
            </div>
            <div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:10px;padding-top:10px;border-top:1px solid #e2e8f0;">
                <span style="font-size:0.77rem;color:#166534;"><span style="color:#059669;font-weight:700;">✅ ≥70%</span> Baik</span>
                <span style="font-size:0.77rem;color:#92400e;"><span style="color:#d97706;font-weight:700;">⚠️ 50–69%</span> Cukup</span>
                <span style="font-size:0.77rem;color:#991b1b;"><span style="color:#dc2626;font-weight:700;">❌ &lt;50%</span> Perlu Latihan</span>
            </div>
        </div>
    </div>`;
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

        setLoadingDetail('Mengambil data peta kompetensi…');

        // Ambil peta kompetensi dari exam_answers
        const babMap = await fetchPetaKompetensi(sessionId);

        setLoadingDetail('Merender hasil analisis…');

        // Sembunyikan loading card
        const loadingCard = document.getElementById('aiLoadingCard');
        if (loadingCard) loadingCard.style.display = 'none';

        // Tambahkan timestamp ke analysisData jika ada
        if (analysisRecord.updated_at && !analysisData.analyzed_at) {
            analysisData.analyzed_at = analysisRecord.updated_at;
        }

        // Render ke UI (kirim babMap untuk peta kompetensi)
        const extraData = buildCognitiveMatrix(analysisData);
        renderGlobalAiAnalysis(analysisData, extraData, babMap);

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