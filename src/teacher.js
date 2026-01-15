import { auth, db, storage } from './firebase.js';
import { signOut, onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, getDocs, query, orderBy, serverTimestamp, where } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const questionText = document.getElementById('question-text');
const imagePreviewContainer = document.getElementById('image-preview-container');
const optionsList = document.getElementById('options-list');
const optionCountSpan = document.getElementById('option-count');
const decreaseBtn = document.getElementById('decrease-options');
const increaseBtn = document.getElementById('increase-options');
const saveBtn = document.getElementById('save-question-btn');
const logoutBtn = document.getElementById('logout-btn');
const tabs = document.querySelectorAll('.nav-item[data-tab]');
const tabContents = document.querySelectorAll('.tab-content');

// Exam Creation Elements
const examTitleInput = document.getElementById('exam-title');
const questionSelectList = document.getElementById('question-select-list');
const refreshQuestionsBtn = document.getElementById('refresh-questions-btn');
const createExamBtn = document.getElementById('create-exam-btn');
const selectedCountSpan = document.getElementById('selected-count');
const examListContainer = document.getElementById('exam-list');

// State
let questionsImages = []; // Array of File objects
let currentOptionCount = 5;
let loadedQuestions = []; // For exam creation
let selectedQuestionIds = new Set();

// Auth Check
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = import.meta.env.BASE_URL + 'login.html';
    } else {
        // Load initial data if needed
        loadCreatedExams();
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = import.meta.env.BASE_URL + 'login.html';
});

// Tab Navigation
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');

        // If switching to create-exam, load questions
        if (tab.dataset.tab === 'create-exam') {
            loadQuestionsForExamCreation();
            loadCreatedExams();
        }
    });
});

// --- Option Management ---
function renderOptions() {
    optionsList.innerHTML = '';
    for (let i = 0; i < currentOptionCount; i++) {
        const optionDiv = document.createElement('div');
        optionDiv.className = 'option-item';
        optionDiv.innerHTML = `
      <input type="radio" name="correct-answer" value="${i}" class="option-radio" ${i === 0 ? 'checked' : ''}>
      <input type="text" class="input-field option-text" placeholder="보기 ${i + 1} 내용">
    `;
        optionsList.appendChild(optionDiv);
    }
    optionCountSpan.textContent = currentOptionCount;
}

decreaseBtn.addEventListener('click', () => {
    if (currentOptionCount > 2) {
        currentOptionCount--;
        renderOptions();
    }
});

increaseBtn.addEventListener('click', () => {
    if (currentOptionCount < 10) {
        currentOptionCount++;
        renderOptions();
    }
});

// Initialize Options
renderOptions();

// --- Image Handling (Paste & Drop) ---
function handleImageFile(file) {
    if (!file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const imgDiv = document.createElement('div');
        imgDiv.className = 'image-preview-item';
        imgDiv.innerHTML = `
      <img src="${e.target.result}" alt="Preview">
      <div class="remove-img-btn" data-index="${questionsImages.length}">×</div>
    `;

        imgDiv.querySelector('.remove-img-btn').addEventListener('click', (ev) => {
            imgDiv.remove();
            // Note: In a real app, we need to handle index management carefully.
            // Here we just remove from UI, actual file array might get out of sync 
            // if we rely on index. Ideally use IDs.
            // For MVP, we'll clear all if complex editing is needed, or just append.
        });

        imagePreviewContainer.appendChild(imgDiv);
    };
    reader.readAsDataURL(file);
    questionsImages.push(file);
}

window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let item of items) {
        if (item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            handleImageFile(blob);
        }
    }
});

// --- Save Question ---
saveBtn.addEventListener('click', async () => {
    const text = questionText.value;
    const optionInputs = document.querySelectorAll('.option-text');
    const options = Array.from(optionInputs).map(input => input.value);
    const answerIndex = document.querySelector('input[name="correct-answer"]:checked').value;

    if (!text && questionsImages.length === 0) {
        alert('질문 내용이나 이미지를 입력해주세요.');
        return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';

    try {
        // 1. Upload Images
        const imageUrls = [];
        for (const file of questionsImages) {
            const storageRef = ref(storage, `questions/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            imageUrls.push(url);
        }

        // 2. Save to Firestore
        await addDoc(collection(db, "questions"), {
            text: text,
            images: imageUrls,
            options: options,
            correctAnswerIndex: parseInt(answerIndex),
            createdAt: serverTimestamp(),
            teacherId: auth.currentUser.uid
        });

        alert('문항이 저장되었습니다.');
        questionText.value = '';
        imagePreviewContainer.innerHTML = '';
        questionsImages = [];
        renderOptions();

        // Reload questions if needed
        loadQuestionsForExamCreation();

    } catch (error) {
        console.error("Error saving question: ", error);
        alert('저장 중 오류가 발생했습니다: ' + error.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '문항 저장하기';
    }
});


// --- Exam Creation Logic ---

refreshQuestionsBtn.addEventListener('click', loadQuestionsForExamCreation);

async function loadQuestionsForExamCreation() {
    if (!auth.currentUser) return;

    questionSelectList.innerHTML = '<div style="text-align:center; padding:1rem;">로딩 중...</div>';

    try {
        const q = query(collection(db, "questions"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        loadedQuestions = [];
        snapshot.forEach(doc => {
            loadedQuestions.push({ id: doc.id, ...doc.data() });
        });

        renderQuestionSelectList();

    } catch (e) {
        console.error("Error loading questions", e);
        questionSelectList.innerHTML = '<div style="text-align:center; color:red;">문항 로드 실패</div>';
    }
}

function renderQuestionSelectList() {
    questionSelectList.innerHTML = '';
    selectedQuestionIds.clear();
    updateSelectedCount(); // reset to 0

    if (loadedQuestions.length === 0) {
        questionSelectList.innerHTML = '<div style="text-align:center; padding:1rem;">등록된 문항이 없습니다.</div>';
        return;
    }

    loadedQuestions.forEach(q => {
        const item = document.createElement('div');
        item.className = 'question-select-item';

        const hasImg = q.images && q.images.length > 0 ? '(이미지 포함)' : '';
        const shortText = q.text ? (q.text.length > 50 ? q.text.substring(0, 50) + '...' : q.text) : '(이미지 문항)';

        item.innerHTML = `
          <input type="checkbox" class="question-checkbox" value="${q.id}">
          <div style="flex:1;">
             <div class="q-preview-text">${shortText} <span style="font-size:0.8em; color:blue;">${hasImg}</span></div>
             <div class="q-preview-meta">작성일: ${q.createdAt ? new Date(q.createdAt.seconds * 1000).toLocaleDateString() : '-'}</div>
          </div>
        `;

        const checkbox = item.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) selectedQuestionIds.add(q.id);
            else selectedQuestionIds.delete(q.id);
            updateSelectedCount();
        });

        questionSelectList.appendChild(item);
    });
}

function updateSelectedCount() {
    selectedCountSpan.textContent = `${selectedQuestionIds.size}개 선택됨`;
}

createExamBtn.addEventListener('click', async () => {
    const title = examTitleInput.value.trim();
    if (!title) {
        alert("시험지 제목을 입력해주세요.");
        return;
    }
    if (selectedQuestionIds.size === 0) {
        alert("최소 1개 이상의 문항을 선택해주세요.");
        return;
    }

    if (!confirm(`${selectedQuestionIds.size}개의 문항으로 시험지를 생성하시겠습니까?`)) return;

    createExamBtn.disabled = true;
    createExamBtn.textContent = '생성 중...';

    try {
        await addDoc(collection(db, "exams"), {
            title: title,
            questionIds: Array.from(selectedQuestionIds),
            teacherId: auth.currentUser.uid,
            createdAt: serverTimestamp(),
            isActive: true
        });

        alert("시험지가 생성되었습니다!");
        examTitleInput.value = '';
        renderQuestionSelectList(); // Reset selection
        loadCreatedExams(); // Reload list

    } catch (e) {
        console.error("Error creating exam", e);
        alert("시험지 생성 실패: " + e.message);
    } finally {
        createExamBtn.disabled = false;
        createExamBtn.textContent = '시험지 생성하기';
    }
});

async function loadCreatedExams() {
    if (!auth.currentUser) return;

    examListContainer.innerHTML = '로딩 중...';
    try {
        const q = query(collection(db, "exams"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        examListContainer.innerHTML = '';
        if (snapshot.empty) {
            examListContainer.innerHTML = '<div style="padding:1rem;">생성된 시험지가 없습니다.</div>';
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = 'question-select-item';
            div.innerHTML = `
              <div style="flex:1;">
                <div class="q-preview-text" style="font-size:1.1rem;">${data.title}</div>
                <div class="q-preview-meta">문항 수: ${data.questionIds ? data.questionIds.length : 0}개 | 생성일: ${data.createdAt ? new Date(data.createdAt.seconds * 1000).toLocaleDateString() : '-'}</div>
              </div>
              <a href="index.html?mode=preview&examId=${doc.id}" target="_blank" class="btn btn-sm btn-outline">미리보기</a>
            `;
            examListContainer.appendChild(div);
        });

    } catch (e) {
        console.error(e);
        examListContainer.innerHTML = '목록 로드 오류';
    }
}
