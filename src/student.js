import { auth, db } from './firebase.js';
import { signOut, onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, orderBy, query, addDoc, serverTimestamp } from "firebase/firestore";

const questionsList = document.getElementById('questions-list');
const submitBtn = document.getElementById('submit-quiz-btn');
const totalCountSpan = document.getElementById('total-count');
const userEmailSpan = document.getElementById('user-email');
const logoutBtn = document.getElementById('logout-btn');
const scoreModal = document.getElementById('score-modal');
const finalScoreEl = document.getElementById('final-score');

let loadedQuestions = [];

// Auth Check
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = import.meta.env.BASE_URL + 'login.html';
    } else {
        userEmailSpan.textContent = user.email;
        loadQuestions();
    }
});

logoutBtn.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = import.meta.env.BASE_URL + 'login.html';
});

async function loadQuestions() {
    try {
        const q = query(collection(db, "questions"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);

        questionsList.innerHTML = '';
        loadedQuestions = [];

        querySnapshot.forEach((doc) => {
            loadedQuestions.push({ id: doc.id, ...doc.data() });
        });

        totalCountSpan.textContent = loadedQuestions.length;

        if (loadedQuestions.length === 0) {
            questionsList.innerHTML = '<div style="text-align: center; padding: 4rem;">등록된 문제가 없습니다.</div>';
            return;
        }

        loadedQuestions.forEach((question, index) => {
            const card = document.createElement('div');
            card.className = 'question-card';

            let imagesHtml = '';
            if (question.images && question.images.length > 0) {
                imagesHtml = `<div class="question-image">
          ${question.images.map(url => `<img src="${url}" alt="Question Image">`).join('')}
        </div>`;
            }

            let optionsHtml = '';
            question.options.forEach((opt, optIndex) => {
                optionsHtml += `
          <label class="option-label">
            <input type="radio" name="q_${question.id}" value="${optIndex}">
            <span>${opt}</span>
          </label>
        `;
            });

            card.innerHTML = `
        <div style="margin-bottom: 1rem; color: var(--primary-color); font-weight: bold;">Q${index + 1}</div>
        <div class="question-text">${question.text || ''}</div>
        ${imagesHtml}
        <div style="margin-top: 1.5rem;">
          ${optionsHtml}
        </div>
      `;

            questionsList.appendChild(card);
        });

    } catch (error) {
        console.error("Error loading questions:", error);
        questionsList.innerHTML = '문제를 불러오는 중 오류가 발생했습니다.';
    }
}

submitBtn.addEventListener('click', async () => {
    if (loadedQuestions.length === 0) return;

    if (!confirm('정말 제출하시겠습니까?')) return;

    let correctCount = 0;
    const userAnswers = {};

    loadedQuestions.forEach(q => {
        const selected = document.querySelector(`input[name="q_${q.id}"]:checked`);
        if (selected) {
            const val = parseInt(selected.value);
            userAnswers[q.id] = val;
            if (val === q.correctAnswerIndex) {
                correctCount++;
            }
        } else {
            userAnswers[q.id] = null;
        }
    });

    const score = Math.round((correctCount / loadedQuestions.length) * 100);

    // Save Result (Optional)
    try {
        await addDoc(collection(db, "results"), {
            studentId: auth.currentUser.uid,
            email: auth.currentUser.email,
            score: score,
            answers: userAnswers,
            timestamp: serverTimestamp()
        });
    } catch (e) {
        console.error("Error saving result", e);
    }

    // Show Result
    finalScoreEl.textContent = score + "점";
    scoreModal.classList.add('show');
});
