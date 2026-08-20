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
// LIST
// ------------------------------------------------------------
async function refreshPracticeQuestionsList() {
    const tbody = document.getElementById('practiceQuestionsTableBody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#9ca3af; padding:2rem;">Memuat...</td></tr>';

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
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:#e84393; padding:2rem;">Gagal memuat data: ${escapeHtml(error.message)}</td></tr>`;
    }
}

function updateReadyBadge(questions) {
    const badge = document.getElementById('practiceReadyBadge');
    if (!badge) return;
    const activeCount = questions.filter(q => q.is_active).length;
    badge.textContent = `${activeCount}/${QUESTIONS_PER_STAGE} soal aktif`;
    badge.classList.toggle('pl-ready-ok', activeCount >= QUESTIONS_PER_STAGE);
}

function renderPracticeQuestionsTable(questions) {
    const tbody = document.getElementById('practiceQuestionsTableBody');
    tbody.innerHTML = '';

    if (questions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#9ca3af; padding:2rem;">Belum ada soal untuk Bab & Tahap ini.</td></tr>';
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
            <td>${escapeHtml(q.correct_answer)}</td>
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
    document.getElementById('practiceQuestionFormData').reset();
    document.getElementById('practiceFormTitle').textContent = 'Tambah Soal Latihan';
    document.getElementById('pqChapter').value = currentFilterChapter;
    updatePracticeSubChapterOptions(currentFilterChapter);
    document.getElementById('pqStage').value = String(currentFilterStage);
    document.getElementById('pqIsActive').value = 'true';
    hideImagePreview();
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

        document.getElementById('practiceFormTitle').textContent = 'Edit Soal Latihan';
        document.getElementById('pqChapter').value = data.chapter;
        updatePracticeSubChapterOptions(data.chapter);
        document.getElementById('pqSubChapter').value = data.sub_chapter || '';
        document.getElementById('pqStage').value = String(data.stage);
        document.getElementById('pqQuestionText').value = data.question_text;
        document.getElementById('pqOptionA').value = data.option_a;
        document.getElementById('pqOptionB').value = data.option_b;
        document.getElementById('pqOptionC').value = data.option_c;
        document.getElementById('pqOptionD').value = data.option_d;
        document.getElementById('pqCorrectAnswer').value = data.correct_answer;
        document.getElementById('pqExplanation').value = data.explanation || '';
        document.getElementById('pqIsActive').value = data.is_active ? 'true' : 'false';

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
    const questionText = document.getElementById('pqQuestionText').value.trim();
    const optionA = document.getElementById('pqOptionA').value.trim();
    const optionB = document.getElementById('pqOptionB').value.trim();
    const optionC = document.getElementById('pqOptionC').value.trim();
    const optionD = document.getElementById('pqOptionD').value.trim();
    const correctAnswer = document.getElementById('pqCorrectAnswer').value;
    const explanation = document.getElementById('pqExplanation').value.trim() || null;
    const isActive = document.getElementById('pqIsActive').value === 'true';

    if (!chapter || !stage || !questionText || !optionA || !optionB || !optionC || !optionD || !correctAnswer) {
        alert('Mohon lengkapi semua field yang wajib diisi (tanda *).');
        return;
    }

    const payload = {
        chapter,
        sub_chapter: subChapter,
        stage,
        question_text: questionText,
        option_a: optionA,
        option_b: optionB,
        option_c: optionC,
        option_d: optionD,
        correct_answer: correctAnswer,
        explanation,
        image_url: uploadedImageUrl,
        is_active: isActive
    };

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
