// admin_material_levels.js
// ============================================================
// Fitur Latihan Soal Bertingkat (Level 1-3) per Materi — Panel Admin
// Turunan dari Brief_Fitur_Latihan_Bertingkat_TKASMP.md Bagian 8.
//
// Ditulis di file TERPISAH dari admin.js (yang sudah sangat besar)
// sesuai rekomendasi brief, dan di-import sebagai <script type="module">
// tambahan di admin.html, SETELAH admin.js.
//
// Reuse dari admin.js (lewat window, karena admin.js expose fungsinya
// ke window di akhir file):
//   - window.showQuestionForm() / window.hideQuestionForm()
//   - window.updateSubChapters()
//   - window.addActivity(...) (kalau tersedia)
//   - saveQuestion() di admin.js sudah di-hook (lihat komentar
//     "HOOK: Fitur Latihan Bertingkat" di admin.js) untuk memanggil
//     window.attachQuestionToLevel() otomatis setelah soal baru
//     berhasil disimpan dari panel ini.
// ============================================================

import { supabase } from './clientSupabase.js';

// Sama persis dengan peta bab/sub-bab yang dipakai admin.js untuk form
// Materi & Soal, supaya filter bank soal konsisten dengan data yang ada.
const CHAPTER_SUBCHAPTERS = {
    'Bilangan': ['Bilangan real'],
    'Aljabar': ['Persamaan dan pertidaksamaan linear', 'bentuk aljabar', 'Fungsi', 'Barisan deret'],
    'Geometri dan pengukuran': ['objek geometri', 'transformasi geometri', 'pengukuran'],
    'Data dan peluang': ['data', 'peluang']
};

// State panel yang sedang terbuka
let panelState = {
    material: null,       // { id, title, chapter, sub_chapter }
    levels: {},            // { 1: {...level row, questions:[...]}, 2: {...}, 3: {...} }
};

// State modal bank soal yang sedang terbuka (kalau ada)
let bankModalState = {
    levelId: null,
    excludedQuestionIds: []
};

// ============================================================
// ENTRY POINT — dipanggil dari tombol "Kelola Level Soal" di tabel materi
// ============================================================
async function openMaterialLevelsPanel(materialId) {
    try {
        const { data: material, error } = await supabase
            .from('materials')
            .select('id, title, chapter, sub_chapter, subject, material_type')
            .eq('id', materialId)
            .single();

        if (error || !material) {
            console.error('Gagal memuat materi:', error);
            alert('Gagal memuat data materi: ' + (error?.message || 'materi tidak ditemukan'));
            return;
        }

        panelState.material = material;
        await ensureLevelRowsExist(materialId);
        await refreshLevelsPanel();

    } catch (err) {
        console.error('Error openMaterialLevelsPanel:', err);
        alert('Terjadi kesalahan saat membuka panel Kelola Level Soal.');
    }
}

// Pastikan 3 baris material_levels (level 1/2/3) sudah ada untuk materi ini.
// Kalau belum, buat draft (is_active = false, passing_score default 5).
async function ensureLevelRowsExist(materialId) {
    const { data: existing, error } = await supabase
        .from('material_levels')
        .select('id, level_number')
        .eq('material_id', materialId);

    if (error) {
        console.error('Gagal cek level existing:', error);
        return;
    }

    const existingNumbers = new Set((existing || []).map(l => l.level_number));
    const missing = [1, 2, 3].filter(n => !existingNumbers.has(n));

    if (missing.length === 0) return;

    const rows = missing.map(n => ({
        material_id: materialId,
        level_number: n,
        title: `Level ${n}`,
        total_questions: 10,
        passing_score: 5,
        is_active: false
    }));

    const { error: insertError } = await supabase.from('material_levels').insert(rows);
    if (insertError) {
        console.error('Gagal membuat baris level default:', insertError);
        alert('Gagal menyiapkan level untuk materi ini: ' + insertError.message);
    }
}

// ============================================================
// LOAD + RENDER PANEL
// ============================================================
async function refreshLevelsPanel() {
    if (!panelState.material) return;
    const materialId = panelState.material.id;

    const { data: levels, error: levelsError } = await supabase
        .from('material_levels')
        .select('id, level_number, title, passing_score, total_questions, is_active')
        .eq('material_id', materialId)
        .order('level_number');

    if (levelsError) {
        console.error('Gagal memuat level:', levelsError);
        alert('Gagal memuat data level: ' + levelsError.message);
        return;
    }

    const levelIds = (levels || []).map(l => l.id);
    let questionsByLevel = {};

    if (levelIds.length > 0) {
        const { data: mlqRows, error: mlqError } = await supabase
            .from('material_level_questions')
            .select('id, level_id, order_position, question_id, questions ( id, question_text, chapter, sub_chapter, difficulty, question_type )')
            .in('level_id', levelIds)
            .order('order_position');

        if (mlqError) {
            console.error('Gagal memuat soal per level:', mlqError);
        } else {
            (mlqRows || []).forEach(row => {
                if (!questionsByLevel[row.level_id]) questionsByLevel[row.level_id] = [];
                questionsByLevel[row.level_id].push(row);
            });
        }
    }

    panelState.levels = {};
    (levels || []).forEach(level => {
        panelState.levels[level.level_number] = {
            ...level,
            questions: questionsByLevel[level.id] || []
        };
    });

    renderLevelsPanelModal();
}

// Bangun / perbarui modal utama (3 kartu level)
function renderLevelsPanelModal() {
    let modal = document.getElementById('materialLevelsModal');
    const isNew = !modal;

    if (isNew) {
        modal = document.createElement('div');
        modal.id = 'materialLevelsModal';
        modal.className = 'analytics-modal';
        document.body.appendChild(modal);
    }

    const material = panelState.material;
    const levelCardsHtml = [1, 2, 3].map(n => renderLevelCardHtml(panelState.levels[n])).join('');

    modal.innerHTML = `
        <div class="modal-content material-levels-modal-content">
            <div class="modal-header">
                <div>
                    <h2><i class="fas fa-layer-group"></i> Kelola Level Soal</h2>
                    <p style="margin:0;color:#6b7280;font-size:0.9rem;">${escapeHtml(material.title || 'Materi')} &middot; ${escapeHtml(material.chapter || '-')}${material.sub_chapter ? ' / ' + escapeHtml(material.sub_chapter) : ''}</p>
                </div>
                <button class="close-btn" onclick="closeMaterialLevelsPanel()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="modal-body">
                <div class="material-levels-grid">
                    ${levelCardsHtml}
                </div>
            </div>
        </div>
    `;
}

function renderLevelCardHtml(levelData) {
    if (!levelData) {
        return `<div class="level-card level-card-loading">Memuat...</div>`;
    }

    const count = levelData.questions.length;
    const counterClass = count === 10 ? 'level-counter-complete' : 'level-counter-incomplete';
    const statusBadge = levelData.is_active
        ? '<span class="status-badge status-active">Aktif</span>'
        : '<span class="status-badge status-inactive">Nonaktif</span>';

    const questionsListHtml = count === 0
        ? `<p class="level-empty-hint">Belum ada soal. Tambahkan dari bank soal atau buat soal baru.</p>`
        : levelData.questions.map((row, idx) => renderQuestionRowHtml(levelData, row, idx, count)).join('');

    const activateDisabled = count !== 10 ? 'disabled' : '';
    const activateTitle = count !== 10 ? `title="Butuh tepat 10 soal untuk mengaktifkan (saat ini ${count})"` : '';

    return `
        <div class="level-card" data-level-id="${levelData.id}">
            <div class="level-card-header">
                <h4>${escapeHtml(levelData.title || ('Level ' + levelData.level_number))}</h4>
                ${statusBadge}
            </div>
            <div class="level-card-counter ${counterClass}">${count}/10 soal</div>

            <div class="level-card-field">
                <label>Ambang lulus (skor minimal dari 10):</label>
                <input type="number" min="0" max="10" value="${levelData.passing_score}"
                    onchange="updateLevelPassingScore('${levelData.id}', this.value)">
            </div>

            <div class="level-card-questions">
                ${questionsListHtml}
            </div>

            <div class="level-card-actions">
                <button class="mini-btn" onclick="openQuestionBankModal('${levelData.id}')" ${count >= 10 ? 'disabled title="Level sudah 10 soal"' : ''}>
                    <i class="fas fa-database"></i> Tambah dari Bank Soal
                </button>
                <button class="mini-btn" onclick="openNewQuestionForLevel('${levelData.id}')" ${count >= 10 ? 'disabled title="Level sudah 10 soal"' : ''}>
                    <i class="fas fa-plus"></i> Buat Soal Baru
                </button>
            </div>

            <label class="level-activate-toggle">
                <input type="checkbox" ${levelData.is_active ? 'checked' : ''} ${activateDisabled} ${activateTitle}
                    onchange="toggleLevelActive('${levelData.id}', this.checked, this)">
                Aktifkan Level ${levelData.level_number === 1 ? '(otomatis terbuka untuk siswa)' : '(terbuka setelah Level ' + (levelData.level_number - 1) + ' lulus)'}
            </label>
        </div>
    `;
}

function renderQuestionRowHtml(levelData, row, idx, total) {
    const q = row.questions;
    const text = q ? q.question_text : '(soal sudah dihapus dari bank soal)';
    const shortText = text && text.length > 60 ? text.substring(0, 60) + '...' : text;

    return `
        <div class="level-question-row">
            <span class="level-question-order">${idx + 1}.</span>
            <span class="level-question-text" title="${escapeHtml(text || '')}">${escapeHtml(shortText || '')}</span>
            <span class="level-question-controls">
                <button class="icon-btn" ${idx === 0 ? 'disabled' : ''} onclick="moveLevelQuestion('${levelData.id}', '${row.id}', 'up')" title="Naikkan urutan">
                    <i class="fas fa-arrow-up"></i>
                </button>
                <button class="icon-btn" ${idx === total - 1 ? 'disabled' : ''} onclick="moveLevelQuestion('${levelData.id}', '${row.id}', 'down')" title="Turunkan urutan">
                    <i class="fas fa-arrow-down"></i>
                </button>
                <button class="icon-btn icon-btn-danger" onclick="removeLevelQuestion('${levelData.id}', '${row.id}')" title="Hapus dari level">
                    <i class="fas fa-times"></i>
                </button>
            </span>
        </div>
    `;
}

function closeMaterialLevelsPanel() {
    const modal = document.getElementById('materialLevelsModal');
    if (modal) modal.remove();
    panelState = { material: null, levels: {} };
}

// ============================================================
// AKSI: passing_score, aktivasi level
// ============================================================
async function updateLevelPassingScore(levelId, rawValue) {
    let value = parseInt(rawValue, 10);
    if (isNaN(value) || value < 0) value = 0;
    if (value > 10) value = 10;

    const { error } = await supabase
        .from('material_levels')
        .update({ passing_score: value })
        .eq('id', levelId);

    if (error) {
        console.error('Gagal update passing_score:', error);
        alert('Gagal menyimpan ambang lulus: ' + error.message);
    }

    await refreshLevelsPanel();
}

async function toggleLevelActive(levelId, checked, checkboxEl) {
    const { error } = await supabase
        .from('material_levels')
        .update({ is_active: checked })
        .eq('id', levelId);

    if (error) {
        console.error('Gagal toggle is_active:', error);
        // Trigger DB (trg_validate_level_activation) menolak aktivasi kalau soal != 10.
        // Pesan errornya sudah cukup jelas untuk ditampilkan langsung ke admin.
        alert('Gagal mengaktifkan level:\n' + error.message);
        if (checkboxEl) checkboxEl.checked = !checked; // revert visual
        return;
    }

    if (typeof window.addActivity === 'function') {
        window.addActivity(
            'fas fa-layer-group',
            checked ? 'Level latihan diaktifkan' : 'Level latihan dinonaktifkan',
            `${panelState.material?.title || ''}`,
            'material_level',
            checked ? 'activated' : 'deactivated',
            'material_level',
            levelId
        );
    }

    await refreshLevelsPanel();
}

// ============================================================
// AKSI: reorder & hapus soal dalam level
// ============================================================
async function moveLevelQuestion(levelId, mlqId, direction) {
    const level = Object.values(panelState.levels).find(l => l.id === levelId);
    if (!level) return;

    const idx = level.questions.findIndex(r => r.id === mlqId);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= level.questions.length) return;

    const current = level.questions[idx];
    const target = level.questions[swapIdx];

    // Swap order_position lewat 2 update. Pakai nilai sementara negatif dulu
    // untuk menghindari bentrok dengan UNIQUE(level_id, order_position).
    const tempPosition = -1;

    const { error: e1 } = await supabase
        .from('material_level_questions')
        .update({ order_position: tempPosition })
        .eq('id', current.id);
    if (e1) { console.error(e1); alert('Gagal mengubah urutan soal: ' + e1.message); return; }

    const { error: e2 } = await supabase
        .from('material_level_questions')
        .update({ order_position: current.order_position })
        .eq('id', target.id);
    if (e2) { console.error(e2); alert('Gagal mengubah urutan soal: ' + e2.message); return; }

    const { error: e3 } = await supabase
        .from('material_level_questions')
        .update({ order_position: target.order_position })
        .eq('id', current.id);
    if (e3) { console.error(e3); alert('Gagal mengubah urutan soal: ' + e3.message); return; }

    await refreshLevelsPanel();
}

async function removeLevelQuestion(levelId, mlqId) {
    if (!confirm('Hapus soal ini dari level?')) return;

    const { error } = await supabase
        .from('material_level_questions')
        .delete()
        .eq('id', mlqId);

    if (error) {
        console.error('Gagal hapus soal dari level:', error);
        alert('Gagal menghapus soal dari level: ' + error.message);
        return;
    }

    await refreshLevelsPanel();
    // Kalau modal bank soal juga sedang terbuka untuk level yang sama, refresh listnya juga
    if (bankModalState.levelId === levelId) {
        await renderQuestionBankResults();
    }
}

// ============================================================
// MODAL: "Tambah dari Bank Soal"
// ============================================================
async function openQuestionBankModal(levelId) {
    bankModalState.levelId = levelId;

    let modal = document.getElementById('questionBankModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'questionBankModal';
        modal.className = 'analytics-modal';
        document.body.appendChild(modal);
    }

    const material = panelState.material;
    const chapterOptions = Object.keys(CHAPTER_SUBCHAPTERS)
        .map(c => `<option value="${escapeHtml(c)}" ${c === material.chapter ? 'selected' : ''}>${escapeHtml(c)}</option>`)
        .join('');

    modal.innerHTML = `
        <div class="modal-content" style="max-width:700px;">
            <div class="modal-header">
                <h2><i class="fas fa-database"></i> Tambah dari Bank Soal</h2>
                <button class="close-btn" onclick="closeQuestionBankModal()"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <div class="bank-filter-row">
                    <input type="text" id="bankSearchText" placeholder="Cari teks soal..." oninput="debouncedBankSearch()">
                    <select id="bankFilterChapter" onchange="renderQuestionBankResults()">
                        <option value="">Semua Bab</option>
                        ${chapterOptions}
                    </select>
                    <select id="bankFilterSubChapter" onchange="renderQuestionBankResults()">
                        <option value="">Semua Sub Bab</option>
                    </select>
                </div>
                <div id="bankResultsContainer" class="bank-results-container">
                    <p style="color:#6b7280;">Memuat soal...</p>
                </div>
            </div>
        </div>
    `;

    populateBankSubChapterOptions(material.chapter, material.sub_chapter);
    await renderQuestionBankResults();
}

function populateBankSubChapterOptions(defaultChapter, defaultSubChapter) {
    const chapterSelect = document.getElementById('bankFilterChapter');
    const subSelect = document.getElementById('bankFilterSubChapter');
    if (!chapterSelect || !subSelect) return;

    if (defaultChapter) chapterSelect.value = defaultChapter;

    const fillSub = () => {
        const chapter = chapterSelect.value;
        subSelect.innerHTML = '<option value="">Semua Sub Bab</option>';
        (CHAPTER_SUBCHAPTERS[chapter] || []).forEach(sub => {
            const opt = document.createElement('option');
            opt.value = sub;
            opt.textContent = sub;
            subSelect.appendChild(opt);
        });
        if (defaultSubChapter && chapter === defaultChapter) {
            subSelect.value = defaultSubChapter;
        }
    };

    chapterSelect.addEventListener('change', fillSub);
    fillSub();
}

let bankSearchDebounceTimer = null;
function debouncedBankSearch() {
    clearTimeout(bankSearchDebounceTimer);
    bankSearchDebounceTimer = setTimeout(renderQuestionBankResults, 300);
}

async function renderQuestionBankResults() {
    const container = document.getElementById('bankResultsContainer');
    if (!container) return;

    const level = Object.values(panelState.levels).find(l => l.id === bankModalState.levelId);
    const remainingSlots = level ? 10 - level.questions.length : 0;
    const excludedIds = level ? level.questions.map(r => r.question_id).filter(Boolean) : [];

    const searchText = (document.getElementById('bankSearchText')?.value || '').trim();
    const chapterFilter = document.getElementById('bankFilterChapter')?.value || '';
    const subChapterFilter = document.getElementById('bankFilterSubChapter')?.value || '';

    let query = supabase
        .from('questions')
        .select('id, question_text, chapter, sub_chapter, difficulty, question_type')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(30);

    if (searchText) query = query.ilike('question_text', `%${searchText}%`);
    if (chapterFilter) query = query.eq('chapter', chapterFilter);
    if (subChapterFilter) query = query.eq('sub_chapter', subChapterFilter);

    const { data: questions, error } = await query;

    if (error) {
        console.error('Gagal cari soal bank:', error);
        container.innerHTML = `<p style="color:#dc2626;">Gagal memuat soal: ${escapeHtml(error.message)}</p>`;
        return;
    }

    const filtered = (questions || []).filter(q => !excludedIds.includes(q.id));

    if (filtered.length === 0) {
        container.innerHTML = `<p style="color:#6b7280;">Tidak ada soal yang cocok dengan filter ini.</p>`;
        return;
    }

    container.innerHTML = filtered.map(q => `
        <div class="bank-result-row">
            <div class="bank-result-text" title="${escapeHtml(q.question_text)}">
                ${escapeHtml(q.question_text.length > 90 ? q.question_text.substring(0, 90) + '...' : q.question_text)}
                <div class="bank-result-meta">${escapeHtml(q.chapter || '-')} ${q.sub_chapter ? '/ ' + escapeHtml(q.sub_chapter) : ''} &middot; ${escapeHtml(q.difficulty || '-')}</div>
            </div>
            <button class="mini-btn" ${remainingSlots <= 0 ? 'disabled title="Level sudah 10 soal"' : ''} onclick="addQuestionFromBank('${q.id}')">
                <i class="fas fa-plus"></i> Tambah
            </button>
        </div>
    `).join('');
}

function closeQuestionBankModal() {
    const modal = document.getElementById('questionBankModal');
    if (modal) modal.remove();
    bankModalState = { levelId: null, excludedQuestionIds: [] };
}

async function addQuestionFromBank(questionId) {
    const levelId = bankModalState.levelId;
    if (!levelId) return;
    await attachQuestionToLevel(levelId, questionId);
    await renderQuestionBankResults();
}

// Dipakai bersama oleh "Tambah dari Bank Soal" dan hook otomatis setelah
// "Buat Soal Baru" (dipanggil dari admin.js saveQuestion()).
async function attachQuestionToLevel(levelId, questionId) {
    const level = Object.values(panelState.levels).find(l => l.id === levelId);
    const currentCount = level ? level.questions.length : 0;

    if (currentCount >= 10) {
        alert('Level ini sudah punya 10 soal. Hapus salah satu dulu sebelum menambah.');
        return;
    }

    const nextPosition = currentCount + 1;

    const { error } = await supabase
        .from('material_level_questions')
        .insert({ level_id: levelId, question_id: questionId, order_position: nextPosition });

    if (error) {
        console.error('Gagal menambah soal ke level:', error);
        alert('Gagal menambah soal ke level: ' + error.message);
        return;
    }

    await refreshLevelsPanel();
}

// ============================================================
// "Buat Soal Baru" — reuse form Manajemen Soal (admin.js)
// ============================================================
function openNewQuestionForLevel(levelId) {
    const material = panelState.material;

    // Tandai bahwa soal berikutnya yang berhasil disimpan (bukan hasil edit)
    // harus otomatis di-attach ke level ini. Dibaca oleh hook di saveQuestion()
    // (admin.js).
    window.pendingLevelAttachId = levelId;

    switchToQuestionsTabWithoutEvent();

    if (typeof window.showQuestionForm === 'function') {
        window.showQuestionForm();
    }

    // Prefill bab/sub-bab soal baru supaya konsisten dengan materi terkait
    // (memudahkan soal ini juga muncul saat difilter di modal bank soal nanti).
    setTimeout(() => {
        const chapterSelect = document.getElementById('chapter');
        if (chapterSelect && material?.chapter) {
            chapterSelect.value = material.chapter;
            if (typeof window.updateSubChapters === 'function') window.updateSubChapters();
            setTimeout(() => {
                const subChapterSelect = document.getElementById('subChapter');
                if (subChapterSelect && material.sub_chapter) {
                    subChapterSelect.value = material.sub_chapter;
                }
            }, 100);
        }
    }, 0);

    closeMaterialLevelsPanel();
    alert('Isi form soal baru di tab "Manajemen Soal". Setelah disimpan, soal akan otomatis ditambahkan ke level yang dipilih.');
}

// Pindah ke tab "Manajemen Soal" tanpa bergantung pada `event.target`
// (showTab() global di admin.html memakai event.target, yang tidak selalu
// tersedia kalau dipanggil bukan langsung dari klik pada nav-tab).
function switchToQuestionsTabWithoutEvent() {
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));

    const questionsTab = document.getElementById('questions');
    if (questionsTab) questionsTab.classList.add('active');

    const questionsNavBtn = Array.from(document.querySelectorAll('.nav-tab'))
        .find(btn => (btn.getAttribute('onclick') || '').includes("showTab('questions')"));
    if (questionsNavBtn) questionsNavBtn.classList.add('active');
}

// ============================================================
// UTIL
// ============================================================
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ============================================================
// EXPORT ke window (pola sama seperti admin.js)
// ============================================================
window.openMaterialLevelsPanel = openMaterialLevelsPanel;
window.closeMaterialLevelsPanel = closeMaterialLevelsPanel;
window.updateLevelPassingScore = updateLevelPassingScore;
window.toggleLevelActive = toggleLevelActive;
window.moveLevelQuestion = moveLevelQuestion;
window.removeLevelQuestion = removeLevelQuestion;
window.openQuestionBankModal = openQuestionBankModal;
window.closeQuestionBankModal = closeQuestionBankModal;
window.addQuestionFromBank = addQuestionFromBank;
window.attachQuestionToLevel = attachQuestionToLevel;
window.openNewQuestionForLevel = openNewQuestionForLevel;
window.debouncedBankSearch = debouncedBankSearch;
window.renderQuestionBankResults = renderQuestionBankResults;
