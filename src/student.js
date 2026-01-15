import { auth, db } from './firebase.js';
import { signOut, onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query, addDoc, serverTimestamp, doc, getDoc, where, documentId } from "firebase/firestore";

// Elements
const userEmailSpan = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');

// View Containers
const examListView = document.getElementById('exam-list-view');
const examTakingView = document.getElementById('exam-taking-view');
const loadingExamsEl = document.getElementById('loading-exams');
const availableExamsList = document.getElementById('available-exams-list');
const scoreModal = document.getElementById('score-modal');
const finalScoreEl = document.getElementById('final-score');

// Exam Taking Elements
const currentExamTitleEl = document.getElementById('current-exam-title');
const currentQNumEl = document.getElementById('current-q-num');
const totalQNumEl = document.getElementById('total-q-num');
const progressBar = document.getElementById('exam-progress-bar');
const stepQIndexEl = document.getElementById('step-q-index');
const stepQuestionText = document.getElementById('step-question-text');
const stepQuestionImages = document.getElementById('step-question-images');
const stepOptionsContainer = document.getElementById('step-options-container');
const prevQBtn = document.getElementById('prev-q-btn');
const nextQBtn = document.getElementById('next-q-btn');
const submitExamBtn = document.getElementById('submit-exam-btn');

// State
let currentExamData = null; // { id, title, questionIds: [] }
let examQuestions = []; // Array of Question Objects
let currentQuestionIndex = 0;
let userAnswers = {}; // { questionId: answerIndex }

// Auth Check & Routing
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = import.meta.env.BASE_URL + 'login.html';
    } else {
        userEmailSpan.textContent = user.email;

        // URL Params Check (Preview Mode)
        const urlParams = new URLSearchParams(window.location.search);
        const mode = urlParams.get('mode');
        const examId = urlParams.get('examId');

        if (mode === 'preview' && examId) {
            // Preview Mode
            await loadExamAndStart(examId, true);
        } else {
            // Normal Student Mode -> Load Exam List
            loadExamList();
        }
    }
});

logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = import.meta.env.BASE_URL + 'login.html';
});

// --- Exam List Logic ---
async function loadExamList() {
    examListView.classList.remove('hidden');
    examTakingView.classList.remove('active'); // Hide taking view
    loadingExamsEl.classList.remove('hidden');
    availableExamsList.innerHTML = '';

    try {
        const q = query(collection(db, "exams"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        loadingExamsEl.classList.add('hidden');

        if (snapshot.empty) {
            availableExamsList.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 2rem;">등록된 시험이 없습니다.</div>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const card = document.createElement('div');
            card.className = 'exam-card';
            card.innerHTML = `
                <div class="exam-title">${data.title}</div>
                <div class="exam-info">문항 수: ${data.questionIds ? data.questionIds.length : 0}문제</div>
                <div class="exam-info">출제자: ${data.teacherId ? '선생님' : 'Unknown'}</div>
                <div style="margin-top: 1rem; text-align: right;">
                    <span style="color: var(--primary-color); font-weight: 600;">시작하기 &rarr;</span>
                </div>
            `;
            card.addEventListener('click', () => {
                loadExamAndStart(doc.id, false);
            });
            availableExamsList.appendChild(card);
        });

    } catch (e) {
        console.error("Error loading exams", e);
        loadingExamsEl.textContent = '시험 목록을 불러오는 중 오류가 발생했습니다.';
    }
}

// --- Start Exam Logic ---
async function loadExamAndStart(examId, isPreview) {
    if (!isPreview) {
        if (!confirm('시험을 시작하시겠습니까?')) return;
    }

    loadingExamsEl.classList.remove('hidden');
    loadingExamsEl.textContent = '시험지를 불러오는 중... (잠시만 기다려주세요)';

    try {
        // 1. Get Exam Metadata
        const examDoc = await getDoc(doc(db, "exams", examId));
        if (!examDoc.exists()) {
            alert("시험지를 찾을 수 없습니다.");
            loadingExamsEl.classList.add('hidden');
            return;
        }
        currentExamData = { id: examDoc.id, ...examDoc.data() };

        // 2. Load Questions
        // Firestore 'in' query supports up to 10 items. If more, need to batch or fetch custom.
        // For simplicity, we will fetch ALL questions first then filter locally (Not efficient for real prod but safe for small scale)
        // OR better: fetch questions one by one? No, too slow.
        // Let's use documentId iterator if possible, but Firestore limit is tricky.
        // Alternative: If questions < 30, fetch individually in parallel.

        const qIds = currentExamData.questionIds || [];
        if (qIds.length === 0) {
            alert("문항이 없는 시험지입니다.");
            return;
        }

        examQuestions = [];

        // Fetch in batches of 10 (Firestore constraint)
        const chunks = [];
        for (let i = 0; i < qIds.length; i += 10) {
            chunks.push(qIds.slice(i, i + 10));
        }

        for (const chunk of chunks) {
            const q = query(collection(db, "questions"), where(documentId(), 'in', chunk));
            const snap = await getDocs(q);
            snap.forEach(d => {
                examQuestions.push({ id: d.id, ...d.data() });
            });
        }

        // Sort questions based on original qIds order
        // (Firestore does not guarantee order)
        examQuestions.sort((a, b) => {
            return qIds.indexOf(a.id) - qIds.indexOf(b.id);
        });

        // Initialize State
        currentQuestionIndex = 0;
        userAnswers = {};

        // Setup View
        examListView.classList.add('hidden');
        availableExamsList.innerHTML = ''; // Clear list to save memory
        examTakingView.classList.add('active');

        currentExamTitleEl.textContent = currentExamData.title + (isPreview ? ' (미리보기)' : '');
        totalQNumEl.textContent = examQuestions.length;

        renderCurrentQuestion();

    } catch (e) {
        console.error("Error starting exam", e);
        alert("시험 로드 실패: " + e.message);
        loadExamList();
    }
}


function renderCurrentQuestion() {
    const question = examQuestions[currentQuestionIndex];
    if (!question) return;

    // Update Meta
    currentQNumEl.textContent = currentQuestionIndex + 1;
    stepQIndexEl.textContent = currentQuestionIndex + 1;

    // Progress
    const progress = ((currentQuestionIndex + 1) / examQuestions.length) * 100;
    progressBar.style.width = `${progress}%`;

    // Content
    stepQuestionText.textContent = question.text || '';

    // Images
    stepQuestionImages.innerHTML = '';
    if (question.images && question.images.length > 0) {
        question.images.forEach(url => {
            const img = document.createElement('img');
            img.src = url;
            stepQuestionImages.appendChild(img);
        });
    }

    // Options
    stepOptionsContainer.innerHTML = '';
    question.options.forEach((opt, idx) => {
        const label = document.createElement('label');
        label.className = `q-option-label ${userAnswers[question.id] === idx ? 'selected' : ''}`;

        label.innerHTML = `
           <input type="radio" name="q_current" value="${idx}" class="hidden" ${userAnswers[question.id] === idx ? 'checked' : ''}>
           <span>${opt}</span>
        `;

        label.addEventListener('click', () => {
            // Select Logic
            userAnswers[question.id] = idx;
            // Update UI
            document.querySelectorAll('.q-option-label').forEach(l => l.classList.remove('selected'));
            label.classList.add('selected');

            // Optional: Auto-save or log
        });

        stepOptionsContainer.appendChild(label);
    });

    // Nav Buttons
    prevQBtn.style.visibility = currentQuestionIndex === 0 ? 'hidden' : 'visible';

    if (currentQuestionIndex === examQuestions.length - 1) {
        nextQBtn.classList.add('hidden');
        submitExamBtn.classList.remove('hidden');
    } else {
        nextQBtn.classList.remove('hidden');
        submitExamBtn.classList.add('hidden');
    }
}

// Nav Events
prevQBtn.addEventListener('click', () => {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        renderCurrentQuestion();
    }
});

nextQBtn.addEventListener('click', () => {
    if (currentQuestionIndex < examQuestions.length - 1) {
        currentQuestionIndex++;
        renderCurrentQuestion();
    }
});

submitExamBtn.addEventListener('click', async () => {
    // Check if all answered? (Optional, maybe allow skip)
    // confirm
    if (!confirm('답안을 제출하시겠습니까?')) return;

    // Calculate Score
    let correctCount = 0;
    examQuestions.forEach(q => {
        if (userAnswers[q.id] === q.correctAnswerIndex) {
            correctCount++;
        }
    });

    const score = Math.round((correctCount / examQuestions.length) * 100);

    // Save Result
    submitExamBtn.disabled = true;
    submitExamBtn.textContent = '제출 중...';

    try {
        await addDoc(collection(db, "results"), {
            examId: currentExamData.id,
            examTitle: currentExamData.title,
            studentId: auth.currentUser.uid,
            email: auth.currentUser.email,
            score: score,
            answers: userAnswers,
            totalQuestions: examQuestions.length,
            correctCount: correctCount,
            timestamp: serverTimestamp()
        });

        finalScoreEl.textContent = score + "점";
        scoreModal.classList.add('show');

    } catch (e) {
        console.error("Submit error", e);
        alert("제출 실패: " + e.message);
        submitExamBtn.disabled = false;
        submitExamBtn.textContent = '제출하기';
    }
});
