import { supabase } from './clientSupabase.js';

// ============================================================
// ADMIN - LATIHAN BERTINGKAT (Tahap 1-2-3)
// Modul ini SENGAJA dipisah total dari admin.js: tidak menyentuh
// tab Materi maupun tab Soal (Simulasi/Evaluasi TKA), dan memakai
// tabel baru: practice_questions (lihat SQL/practice_bertingkat_setup.sql)
// ============================================================

const CHAPTERS = ['Bilangan', 'Aljabar', 'Geometri dan pengukuran', 'Data dan peluang'];
const SUB_CHAPTERS = {
    'Bilangan': ['Bilangan real'],
    'Aljabar': ['Persamaan dan pertidaksamaan linear', 'bentuk aljabar', 'Fungsi', 'Barisan deret'],
    'Geometri dan pengukuran': ['objek geometri', 'transformasi geometri', 'pengukuran'],
    'Data dan peluang': ['data', 'peluang']
};
const QUESTIONS_PER_STAGE = 10;

let currentFilterChapter = CHAPTERS[0];
let currentFilterStage = 1;
let currentEditingId = null;
let uploadedImageUrl = null; // hasil upload gambar untuk soal yang sedang diedit/ditambah

// Data PGK Kategori saat admin sedang mengedit form
let practiceKategoriRows = []; // [{statement:'', isTrue: null}, ...]

// ------------------------------------------------------------
// INIT - dipanggil dari onclick tombol tab "Latihan Bertingkat"
// di admin.html (window.loadPracticeLevelsTab), BUKAN dari
// DOMContentLoaded, supaya tidak query database sebelum tab dibuka.
// ------------------------------------------------------------
let practiceTabInitialized = false;

async function loadPracticeLevelsTab() {
    if (!practiceTabInitialized) {
        populateChapterSelects();
        practiceTabInitialized = true;
    }
    await refreshPracticeQuestionsList();
}
window.loadPracticeLevelsTab = loadPracticeLevelsTab;

function populateChapterSelects() {
    const filterSelect = document.getElementById('practiceFilterChapter');
    const formSelect = document.getElementById('pqChapter');
    [filterSelect, formSelect].forEach(sel => {
        if (!sel) return;
        sel.innerHTML = '';
        CHAPTERS.forEach(ch => {
            const opt = document.createElement('option');
            opt.value = ch;
            opt.textContent = ch;
            sel.appendChild(opt);
        });
    });
    if (filterSelect) filterSelect.value = currentFilterChapter;
    if (formSelect) {
        formSelect.value = currentFilterChapter;
        formSelect.addEventListener('change', () => updatePracticeSubChapterOptions(formSelect.value));
        updatePracticeSubChapterOptions(formSelect.value);
    }
}

function updatePracticeSubChapterOptions(chapter) {
    const subSelect = document.getElementById('pqSubChapter');
    if (!subSelect) return;
    subSelect.innerHTML = '<option value="">- Tidak ada -</option>';
    (SUB_CHAPTERS[chapter] || []).forEach(sub => {
        const opt = document.createElement('option');
        opt.value = sub;
        opt.textContent = sub;
        subSelect.appendChild(opt);
    });
}

function onPracticeFilterChange() {
    currentFilterChapter = document.getElementById('practiceFilterChapter').value;
    refreshPracticeQuestionsList();
}
window.onPracticeFilterChange = onPracticeFilterChange;

function switchPracticeStage(stage) {
    currentFilterStage = stage;
    document.querySelectorAll('.pl-stage-tab').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.stage, 10) === stage);
    });
    refreshPracticeQuestionsList();
}
window.switchPracticeStage = switchPracticeStage;

// ------------------------------------------------------------
// QUESTION TYPE FORM SWITCHING
// ------------------------------------------------------------
function onPracticeQuestionTypeChange() {
    const questionType = document.getElementById('pqQuestionType').value;
    const areaPG = document.getElementById('pqAreaPG');
    const areaMCMA = document.getElementById('pqAreaMCMA');
    const areaKategori = document.getElementById('pqAreaKategori');

    areaPG.style.display = questionType === 'PG' ? 'block' : 'none';
    areaMCMA.style.display = questionType === 'PGK MCMA' ? 'block' : 'none';
    areaKategori.style.display = questionType === 'PGK Kategori' ? 'block' : 'none';

    // Init kategori rows if switching to Kategori for the first time
    if (questionType === 'PGK Kategori' && practiceKategoriRows.length === 0) {
        practiceKategoriRows = [{ statement: '', isTrue: null }];
        renderKategoriTable();
    }
}
window.onPracticeQuestionTypeChange = onPracticeQuestionTypeChange;

// ------------------------------------------------------------
// PGK KATEGORI - dynamic table management
// ------------------------------------------------------------
function addPracticeKategoriRow() {
    practiceKategoriRows.push({ statement: '', isTrue: null });
    renderKategoriTable();
}
window.addPracticeKategoriRow = addPracticeKategoriRow;

function removePracticeKategoriRow(index) {
    if (practiceKategoriRows.length <= 1) {
        alert('Minimal harus ada 1 pernyataan.');
        return;
    }
    practiceKategoriRows.splice(index, 1);
    renderKategoriTable();
}
window.removePracticeKategoriRow = removePracticeKategoriRow;

function updatePracticeKategoriStatement(index, value) {
    practiceKategoriRows[index].statement = value;
}
window.updatePracticeKategoriStatement = updatePracticeKategoriStatement;

function updatePracticeKategoriTruth(index, isTrue) {
    practiceKategoriRows[index].isTrue = isTrue;
}
window.updatePracticeKategoriTruth = updatePracticeKategoriTruth;

function renderKategoriTable() {
    const tbody = document.getElementById('pqKategoriTableBody');
    if (!tbody) return;

    tbody.innerHTML = practiceKategoriRows.map((row, idx) => `
        <tr>
            <td style="text-align:center; font-weight:600; color:#6b7280;">${idx + 1}</td>
            <td>
                <input type="text"
                       class="pl-kategori-input"
                       value="${escapeHtml(row.statement).replace(/"/g, '&quot;')}"
                       placeholder="Tulis pernyataan... (LaTeX: \\( rumus \\))"
                       oninput="updatePracticeKategoriStatement(${idx}, this.value)">
            </td>
            <td style="text-align:center;">
                <input type="radio" name="pqKat${idx}" value="true"
                       ${row.isTrue === true ? 'checked' : ''}
                       onchange="updatePracticeKategoriTruth(${idx}, true)">
            </td>
            <td style="text-align:center;">
                <input type="radio" name="pqKat${idx}" value="false"
                       ${row.isTrue === false ? 'checked' : ''}
                       onchange="updatePracticeKategoriTruth(${idx}, false)">
            </td>
            <td style="text-align:center;">
                ${idx > 0 ? `<button type="button" class="pl-kategori-remove-btn"
                    onclick="removePracticeKategoriRow(${idx})" title="Hapus"><i class="fas fa-trash"></i></button>` : ''}
            </td>
        </tr>
    `).join('');
}

// ------------------------------------------------------------
// LIST
// ------------------------------------------------------------
async function refreshPracticeQuestionsList() {
    const tbody = document.getElementById('practiceQuestionsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#9ca3af; padding:2rem;">Memuat...</td></tr>';

    try {
        const { data, error } = await supabase
            .from('practice_questions')
            .select('*')
            .eq('chapter', currentFilterChapter)
            .eq('stage', currentFilterStage)
            .order('created_at', { ascending: true });

        if (error) throw error;

        renderPracticeQuestionsTable(data || []);
        updateReadyBadge(data || []);
    } catch (error) {
        console.error('Gagal memuat soal latihan:', error);
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:#e84393; padding:2rem;">Gagal memuat data: ${escapeHtml(error.message)}</td></tr>`;
    }
}

function updateReadyBadge(questions) {
    const badge = document.getElementById('practiceReadyBadge');
    if (!badge) return;
    const activeCount = questions.filter(q => q.is_active).length;
    badge.textContent = `${activeCount}/${QUESTIONS_PER_STAGE} soal aktif`;
    badge.classList.toggle('pl-ready-ok', activeCount >= QUESTIONS_PER_STAGE);
}

function getQuestionTypeBadge(questionType) {
    switch (questionType) {
        case 'PGK MCMA':
            return '<span class="pl-type-badge pl-type-mcma">MCMA</span>';
        case 'PGK Kategori':
            return '<span class="pl-type-badge pl-type-kategori">Kategori</span>';
        case 'PG':
        default:
            return '<span class="pl-type-badge pl-type-pg">PG</span>';
    }
}

function getCorrectAnswerDisplay(q) {
    const questionType = q.question_type || 'PG';
    switch (questionType) {
        case 'PGK MCMA':
            return q.correct_answers ? q.correct_answers.join(', ') : '-';
        case 'PGK Kategori': {
            if (!q.category_mapping) return '-';
            try {
                const mapping = typeof q.category_mapping === 'string' ? JSON.parse(q.category_mapping) : q.category_mapping;
                const entries = Object.entries(mapping);
                return entries.map(([idx, val]) => `${parseInt(idx)+1}:${val ? 'B' : 'S'}`).join(', ');
            } catch { return '-'; }
        }
        default:
            return q.correct_answer || '-';
    }
}

function renderPracticeQuestionsTable(questions) {
    const tbody = document.getElementById('practiceQuestionsTableBody');
    tbody.innerHTML = '';

    if (questions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#9ca3af; padding:2rem;">Belum ada soal untuk Bab & Tahap ini.</td></tr>';
        return;
    }

    questions.forEach(q => {
        const row = document.createElement('tr');
        const shortQuestion = q.question_text.length > 70 ? q.question_text.substring(0, 70) + '...' : q.question_text;
        const statusBadge = q.is_active
            ? '<span class="status-badge status-active">Aktif</span>'
            : '<span class="status-badge status-inactive">Nonaktif</span>';

        row.innerHTML = `
            <td class="pl-question-cell" title="${escapeHtml(q.question_text)}">${escapeHtml(shortQuestion)}</td>
            <td>${getQuestionTypeBadge(q.question_type)}</td>
            <td>${escapeHtml(getCorrectAnswerDisplay(q))}</td>
            <td>${statusBadge}</td>
            <td>
                <button class="pl-edit-btn" onclick="editPracticeQuestion('${q.id}')"><i class="fas fa-edit"></i> Edit</button>
                <button class="pl-toggle-btn" onclick="togglePracticeQuestionActive('${q.id}', ${!q.is_active})">
                    <i class="fas fa-power-off"></i> ${q.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                </button>
                <button class="pl-delete-btn" onclick="deletePracticeQuestion('${q.id}')"><i class="fas fa-trash"></i> Hapus</button>
            </td>
        `;
        tbody.appendChild(row);
    });
}

// ------------------------------------------------------------
// FORM SHOW/HIDE
// ------------------------------------------------------------
function showPracticeQuestionForm() {
    currentEditingId = null;
    uploadedImageUrl = null;
    practiceKategoriRows = [];
    document.getElementById('practiceQuestionFormData').reset();
    document.getElementById('practiceFormTitle').textContent = 'Tambah Soal Latihan';
    document.getElementById('pqChapter').value = currentFilterChapter;
    updatePracticeSubChapterOptions(currentFilterChapter);
    document.getElementById('pqStage').value = String(currentFilterStage);
    document.getElementById('pqQuestionType').value = 'PG';
    document.getElementById('pqIsActive').value = 'true';
    hideImagePreview();
    onPracticeQuestionTypeChange(); // show/hide correct form area
    document.getElementById('practiceQuestionForm').style.display = 'block';
    document.getElementById('addPracticeQuestionBtn').style.display = 'none';
    document.getElementById('practiceQuestionForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
window.showPracticeQuestionForm = showPracticeQuestionForm;

function hidePracticeQuestionForm() {
    document.getElementById('practiceQuestionForm').style.display = 'none';
    document.getElementById('addPracticeQuestionBtn').style.display = 'inline-flex';
    currentEditingId = null;
    uploadedImageUrl = null;
    practiceKategoriRows = [];
}
window.hidePracticeQuestionForm = hidePracticeQuestionForm;

// ------------------------------------------------------------
// EDIT
// ------------------------------------------------------------
async function editPracticeQuestion(id) {
    try {
        const { data, error } = await supabase.from('practice_questions').select('*').eq('id', id).single();
        if (error) throw error;

        currentEditingId = id;
        uploadedImageUrl = data.image_url || null;

        const questionType = data.question_type || 'PG';

        document.getElementById('practiceFormTitle').textContent = 'Edit Soal Latihan';
        document.getElementById('pqChapter').value = data.chapter;
        updatePracticeSubChapterOptions(data.chapter);
        document.getElementById('pqSubChapter').value = data.sub_chapter || '';
        document.getElementById('pqStage').value = String(data.stage);
        document.getElementById('pqQuestionType').value = questionType;
        document.getElementById('pqQuestionText').value = data.question_text;
        document.getElementById('pqExplanation').value = data.explanation || '';
        document.getElementById('pqIsActive').value = data.is_active ? 'true' : 'false';

        // Show correct form area
        onPracticeQuestionTypeChange();

        // Populate type-specific fields
        if (questionType === 'PG') {
            document.getElementById('pqOptionA').value = data.option_a || '';
            document.getElementById('pqOptionB').value = data.option_b || '';
            document.getElementById('pqOptionC').value = data.option_c || '';
            document.getElementById('pqOptionD').value = data.option_d || '';
            document.getElementById('pqCorrectAnswer').value = data.correct_answer || '';
        } else if (questionType === 'PGK MCMA') {
            document.getElementById('pqMcmaOptA').value = data.option_a || '';
            document.getElementById('pqMcmaOptB').value = data.option_b || '';
            document.getElementById('pqMcmaOptC').value = data.option_c || '';
            document.getElementById('pqMcmaOptD').value = data.option_d || '';
            // Check correct answers
            const correctArr = data.correct_answers || [];
            document.getElementById('pqMcmaA').checked = correctArr.includes('A');
            document.getElementById('pqMcmaB').checked = correctArr.includes('B');
            document.getElementById('pqMcmaC').checked = correctArr.includes('C');
            document.getElementById('pqMcmaD').checked = correctArr.includes('D');
        } else if (questionType === 'PGK Kategori') {
            // Populate kategori rows from saved data
            let statements = [];
            try {
                statements = data.category_options || [];
                if (typeof statements === 'string') statements = JSON.parse(statements);
            } catch { statements = []; }

            let mapping = {};
            try {
                mapping = data.category_mapping || {};
                if (typeof mapping === 'string') mapping = JSON.parse(mapping);
            } catch { mapping = {}; }

            practiceKategoriRows = statements.map((stmt, idx) => ({
                statement: stmt,
                isTrue: mapping.hasOwnProperty(String(idx)) ? mapping[String(idx)] : null
            }));

            if (practiceKategoriRows.length === 0) {
                practiceKategoriRows = [{ statement: '', isTrue: null }];
            }
            renderKategoriTable();
        }

        if (data.image_url) {
            showImagePreview(data.image_url);
        } else {
            hideImagePreview();
        }

        document.getElementById('practiceQuestionForm').style.display = 'block';
        document.getElementById('addPracticeQuestionBtn').style.display = 'none';
        document.getElementById('practiceQuestionForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (error) {
        console.error('Gagal memuat soal untuk diedit:', error);
        alert('Gagal memuat soal: ' + error.message);
    }
}
window.editPracticeQuestion = editPracticeQuestion;

// ------------------------------------------------------------
// SAVE (insert / update)
// ------------------------------------------------------------
async function savePracticeQuestion(event) {
    event.preventDefault();

    const chapter = document.getElementById('pqChapter').value;
    const subChapter = document.getElementById('pqSubChapter').value || null;
    const stage = parseInt(document.getElementById('pqStage').value, 10);
    const questionType = document.getElementById('pqQuestionType').value;
    const questionText = document.getElementById('pqQuestionText').value.trim();
    const explanation = document.getElementById('pqExplanation').value.trim() || null;
    const isActive = document.getElementById('pqIsActive').value === 'true';

    if (!chapter || !stage || !questionText) {
        alert('Mohon lengkapi Bab, Tahap, dan Teks Soal.');
        return;
    }

    // Build payload based on question type
    const payload = {
        chapter,
        sub_chapter: subChapter,
        stage,
        question_type: questionType,
        question_text: questionText,
        explanation,
        image_url: uploadedImageUrl,
        is_active: isActive,
        // Reset fields that may not apply
        option_a: null, option_b: null, option_c: null, option_d: null,
        correct_answer: null, correct_answers: null,
        category_options: null, category_mapping: null
    };

    if (questionType === 'PG') {
        const optA = document.getElementById('pqOptionA').value.trim();
        const optB = document.getElementById('pqOptionB').value.trim();
        const optC = document.getElementById('pqOptionC').value.trim();
        const optD = document.getElementById('pqOptionD').value.trim();
        const correctAnswer = document.getElementById('pqCorrectAnswer').value;

        if (!optA || !optB || !optC || !optD || !correctAnswer) {
            alert('Untuk Pilihan Ganda, semua opsi A–D dan jawaban benar wajib diisi.');
            return;
        }
        payload.option_a = optA;
        payload.option_b = optB;
        payload.option_c = optC;
        payload.option_d = optD;
        payload.correct_answer = correctAnswer;

    } else if (questionType === 'PGK MCMA') {
        const optA = document.getElementById('pqMcmaOptA').value.trim();
        const optB = document.getElementById('pqMcmaOptB').value.trim();
        const optC = document.getElementById('pqMcmaOptC').value.trim();
        const optD = document.getElementById('pqMcmaOptD').value.trim();

        if (!optA || !optB || !optC || !optD) {
            alert('Untuk PGK MCMA, semua opsi A–D wajib diisi.');
            return;
        }

        const correctAnswers = [];
        if (document.getElementById('pqMcmaA').checked) correctAnswers.push('A');
        if (document.getElementById('pqMcmaB').checked) correctAnswers.push('B');
        if (document.getElementById('pqMcmaC').checked) correctAnswers.push('C');
        if (document.getElementById('pqMcmaD').checked) correctAnswers.push('D');

        if (correctAnswers.length === 0) {
            alert('Untuk PGK MCMA, centang minimal 1 jawaban benar.');
            return;
        }

        payload.option_a = optA;
        payload.option_b = optB;
        payload.option_c = optC;
        payload.option_d = optD;
        payload.correct_answers = correctAnswers;

    } else if (questionType === 'PGK Kategori') {
        // Validate statements
        const validRows = practiceKategoriRows.filter(r => r.statement.trim() !== '');
        if (validRows.length === 0) {
            alert('Untuk PGK Kategori, minimal 1 pernyataan harus diisi.');
            return;
        }
        const allTruthSet = validRows.every(r => r.isTrue === true || r.isTrue === false);
        if (!allTruthSet) {
            alert('Setiap pernyataan harus ditentukan Benar atau Salah.');
            return;
        }

        const categoryOptions = validRows.map(r => r.statement.trim());
        const categoryMapping = {};
        validRows.forEach((r, idx) => {
            categoryMapping[String(idx)] = r.isTrue;
        });

        payload.category_options = categoryOptions;
        payload.category_mapping = categoryMapping;
    }

    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalBtnHtml = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';

    try {
        let result;
        if (currentEditingId) {
            result = await supabase.from('practice_questions').update(payload).eq('id', currentEditingId).select();
        } else {
            const { data: { user } } = await supabase.auth.getUser();
            payload.created_by = user?.id || null;
            result = await supabase.from('practice_questions').insert(payload).select();
        }

        if (result.error) throw result.error;

        alert(currentEditingId ? 'Soal berhasil diperbarui!' : 'Soal berhasil ditambahkan!');

        hidePracticeQuestionForm();

        // Jika soal baru disimpan untuk Bab/Tahap yang sedang difilter, refresh list-nya
        currentFilterChapter = chapter;
        currentFilterStage = stage;
        document.getElementById('practiceFilterChapter').value = chapter;
        document.querySelectorAll('.pl-stage-tab').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.stage, 10) === stage);
        });
        await refreshPracticeQuestionsList();

    } catch (error) {
        console.error('Gagal menyimpan soal latihan:', error);
        let msg = 'Gagal menyimpan soal: ' + error.message;
        if (error.message && error.message.includes('practice_questions') && error.message.includes('does not exist')) {
            msg += '\n\nTabel practice_questions belum dibuat. Jalankan SQL/practice_bertingkat_setup.sql di Supabase SQL Editor terlebih dahulu.';
        }
        if (error.message && (error.message.includes('question_type') || error.message.includes('correct_answers') || error.message.includes('category_options'))) {
            msg += '\n\nKolom baru belum ada. Jalankan SQL/practice_add_question_types.sql di Supabase SQL Editor.';
        }
        alert(msg);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnHtml;
    }
}
window.savePracticeQuestion = savePracticeQuestion;

// ------------------------------------------------------------
// TOGGLE AKTIF / NONAKTIF
// ------------------------------------------------------------
async function togglePracticeQuestionActive(id, newActiveState) {
    try {
        const { error } = await supabase.from('practice_questions').update({ is_active: newActiveState }).eq('id', id);
        if (error) throw error;
        await refreshPracticeQuestionsList();
    } catch (error) {
        console.error('Gagal mengubah status soal:', error);
        alert('Gagal mengubah status soal: ' + error.message);
    }
}
window.togglePracticeQuestionActive = togglePracticeQuestionActive;

// ------------------------------------------------------------
// DELETE
// ------------------------------------------------------------
async function deletePracticeQuestion(id) {
    if (!confirm('Hapus soal ini? Tindakan ini tidak bisa dibatalkan.')) return;
    try {
        const { error } = await supabase.from('practice_questions').delete().eq('id', id);
        if (error) throw error;
        await refreshPracticeQuestionsList();
    } catch (error) {
        console.error('Gagal menghapus soal:', error);
        alert('Gagal menghapus soal: ' + error.message);
    }
}
window.deletePracticeQuestion = deletePracticeQuestion;

// ------------------------------------------------------------
// UPLOAD GAMBAR (bucket 'images', folder practice-images/ - bucket sama
// dengan yang dipakai soal Simulasi/Evaluasi TKA, hanya folder berbeda)
// ------------------------------------------------------------
async function handlePracticeImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert('Ukuran gambar maksimal 5MB.');
        event.target.value = '';
        return;
    }

    const preview = document.getElementById('pqImagePreview');
    const previewImg = document.getElementById('pqImagePreviewImg');
    previewImg.src = URL.createObjectURL(file);
    preview.style.display = 'inline-block';

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}.${fileExt}`;
        const filePath = `practice-images/${fileName}`;

        const { error } = await supabase.storage.from('images').upload(filePath, file);
        if (error) {
            if (error.message.includes('Bucket not found') || error.message.includes('bucket')) {
                throw new Error('Storage bucket "images" belum ada. Jalankan script setup_storage_buckets.sql di Supabase SQL Editor.');
            }
            throw error;
        }

        const { data: urlData } = supabase.storage.from('images').getPublicUrl(filePath);
        uploadedImageUrl = urlData.publicUrl;
    } catch (error) {
        console.error('Gagal upload gambar:', error);
        alert('Gagal upload gambar: ' + error.message);
        hideImagePreview();
        event.target.value = '';
    }
}
window.handlePracticeImageUpload = handlePracticeImageUpload;

function removePracticeImage() {
    uploadedImageUrl = null;
    hideImagePreview();
    const fileInput = document.getElementById('pqImage');
    if (fileInput) fileInput.value = '';
}
window.removePracticeImage = removePracticeImage;

function showImagePreview(url) {
    const preview = document.getElementById('pqImagePreview');
    const previewImg = document.getElementById('pqImagePreviewImg');
    previewImg.src = url;
    preview.style.display = 'inline-block';
}

function hideImagePreview() {
    const preview = document.getElementById('pqImagePreview');
    if (preview) preview.style.display = 'none';
}

// ------------------------------------------------------------
// UTIL
// ------------------------------------------------------------
function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
