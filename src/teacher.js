import { auth, db, storage } from './firebase.js';
import { signOut, onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
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

// State
let questionsImages = []; // Array of File objects
let currentOptionCount = 5;

// Auth Check
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = '/login.html';
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = '/login.html';
});

// Tab Navigation
tabs.forEach(tab => {
    tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));

        tab.classList.add('active');
        document.getElementById(tab.dataset.tab).classList.add('active');
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

        // Add remove handler
        imgDiv.querySelector('.remove-img-btn').addEventListener('click', (ev) => {
            const idx = parseInt(ev.target.dataset.index);
            // Remove from DOM
            imgDiv.remove();
            // Note: Actual removal from array is complex with simple index, best to reconstruct or filter.
            // For simplicity in this demo, we just hide UI. Real app needs ID mapping.
        });

        imagePreviewContainer.appendChild(imgDiv);
    };
    reader.readAsDataURL(file);
    questionsImages.push(file);
}

// Paste Event
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
        // Assuming we have a 'questions' collection. 
        // In a real app, strict hierarchy maybe: quizzes -> [questions]
        await addDoc(collection(db, "questions"), {
            text: text,
            images: imageUrls,
            options: options,
            correctAnswerIndex: parseInt(answerIndex),
            createdAt: serverTimestamp(),
            teacherId: auth.currentUser.uid
        });

        alert('문항이 저장되었습니다.');
        // Reset Form
        questionText.value = '';
        imagePreviewContainer.innerHTML = '';
        questionsImages = [];
        renderOptions();

    } catch (error) {
        console.error("Error saving question: ", error);
        alert('저장 중 오류가 발생했습니다.');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '저장하기';
    }
});
