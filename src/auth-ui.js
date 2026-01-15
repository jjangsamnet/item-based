import { auth, db } from './firebase.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    onAuthStateChanged
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const roleSelect = document.getElementById('role');
const signupFields = document.getElementById('signup-fields');
const submitText = document.getElementById('submit-text');
const toggleText = document.getElementById('toggle-text');
const toggleBtn = document.getElementById('toggle-auth-mode');
const errorMsg = document.getElementById('error-message');

let isSignup = false;

// Toggle Login/Signup Mode
toggleBtn.addEventListener('click', (e) => {
    e.preventDefault();
    isSignup = !isSignup;

    if (isSignup) {
        signupFields.classList.remove('hidden');
        submitText.textContent = '회원가입';
        toggleText.textContent = '이미 계정이 있으신가요?';
        toggleBtn.textContent = '로그인';
    } else {
        signupFields.classList.add('hidden');
        submitText.textContent = '로그인';
        toggleText.textContent = '계정이 없으신가요?';
        toggleBtn.textContent = '회원가입';
    }
    errorMsg.classList.add('hidden');
});

// Handle Form Submit
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;

    errorMsg.classList.add('hidden');

    try {
        if (isSignup) {
            // Sign Up Logic
            const role = roleSelect.value;
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Save User Role to Firestore
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                role: role,
                createdAt: new Date()
            });

            alert('회원가입 성공! 로그인되었습니다.');
            redirectUser(role);

        } else {
            // Login Logic
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Get User Role
            const userDoc = await getDoc(doc(db, "users", user.uid));
            if (userDoc.exists()) {
                const userData = userDoc.data();
                redirectUser(userData.role);
            } else {
                // Fallback for users without role document (should not happen normally)
                throw new Error("사용자 정보를 찾을 수 없습니다.");
            }
        }
    } catch (error) {
        console.error(error);
        errorMsg.textContent = getErrorMessage(error.code);
        errorMsg.classList.remove('hidden');
    }
});

function redirectUser(role) {
    const baseUrl = import.meta.env.BASE_URL;
    if (role === 'teacher' || role === 'admin') {
        window.location.href = baseUrl + 'teacher.html';
    } else {
        window.location.href = baseUrl + 'index.html';
    }
}

function getErrorMessage(code) {
    switch (code) {
        case 'auth/email-already-in-use': return '이미 사용 중인 이메일입니다.';
        case 'auth/invalid-email': return '유효하지 않은 이메일 형식입니다.';
        case 'auth/user-not-found': return '사용자를 찾을 수 없습니다.';
        case 'auth/wrong-password': return '비밀번호가 틀렸습니다.';
        case 'auth/weak-password': return '비밀번호는 6자 이상이어야 합니다.';
        default: return '로그인/회원가입 중 오류가 발생했습니다: ' + code;
    }
}

// Check Auth State on Load
onAuthStateChanged(auth, async (user) => {
    if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        if (userDoc.exists()) {
            // 이미 로그인 되어 있으면 리다이렉트 (로그인 페이지 접근 시)
            // redirectUser(userDoc.data().role);
        }
    }
});
