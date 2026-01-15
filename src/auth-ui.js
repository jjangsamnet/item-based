import { auth, db, googleProvider } from './firebase.js';
import {
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    signInWithPopup,
    onAuthStateChanged
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

// Elements
const authForm = document.getElementById('auth-form');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const passwordConfirmInput = document.getElementById('password-confirm');
const roleSelect = document.getElementById('role');
const regionSelect = document.getElementById('user-region');
const schoolInput = document.getElementById('user-school');

const signupFields = document.getElementById('signup-fields');
const submitText = document.getElementById('submit-text');
const toggleText = document.getElementById('toggle-text');
const toggleBtn = document.getElementById('toggle-auth-mode');
const errorMsg = document.getElementById('error-message');
const googleBtn = document.getElementById('google-login-btn');

// Modal Elements
const additionalInfoModal = document.getElementById('additional-info-modal');
const socialSignupForm = document.getElementById('social-signup-form');
const googleRole = document.getElementById('google-role');
const googleRegion = document.getElementById('google-region');
const googleSchool = document.getElementById('google-school');

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
        // 입력 필드 초기화 (선택사항)
    } else {
        signupFields.classList.add('hidden');
        submitText.textContent = '로그인';
        toggleText.textContent = '계정이 없으신가요?';
        toggleBtn.textContent = '회원가입';
    }
    errorMsg.classList.add('hidden');
});

// Handle Email/Password Form Submit
authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const password = passwordInput.value;

    errorMsg.classList.add('hidden');

    try {
        if (isSignup) {
            // 1. Validate Password Confirm
            if (password !== passwordConfirmInput.value) {
                throw { code: 'custom/password-mismatch' };
            }

            // 2. Validate Region & School
            if (!regionSelect.value || !schoolInput.value) {
                alert("지역과 학교명을 입력해주세요.");
                return;
            }

            // Sign Up Logic
            const role = roleSelect.value;
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Save User Role to Firestore
            await setDoc(doc(db, "users", user.uid), {
                email: user.email,
                role: role,
                region: regionSelect.value,
                school: schoolInput.value,
                createdAt: new Date(),
                authProvider: 'email'
            });

            alert('회원가입 성공! 로그인되었습니다.');
            redirectUser(role);

        } else {
            // Login Logic
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            checkUserDocAndRedirect(userCredential.user);
        }
    } catch (error) {
        console.error(error);
        errorMsg.textContent = getErrorMessage(error.code);
        errorMsg.classList.remove('hidden');
    }
});

// Handle Google Login
googleBtn.addEventListener('click', async () => {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        const user = result.user;
        checkUserDocAndRedirect(user);
    } catch (error) {
        console.error(error);
        if (error.code === 'auth/popup-closed-by-user') return;
        alert("Google 로그인 실패: " + error.message);
    }
});

// Check if user doc exists, redirect or show modal
async function checkUserDocAndRedirect(user) {
    try {
        const userDocRef = doc(db, "users", user.uid);
        const userDoc = await getDoc(userDocRef);

        if (userDoc.exists()) {
            // Already registered fully
            redirectUser(userDoc.data().role);
        } else {
            // User authenticated but no DB record (e.g. first Google login)
            // Show modal to collect Role, Region, School
            additionalInfoModal.classList.remove('hidden');
        }
    } catch (e) {
        console.error("Error checking user doc:", e);
        // If it's the 'internet offline' or 'unavailable' issue, handle gracefully
        // Or assume new user needs setup? No, better error safety.
        alert("로그인 처리 중 오류가 발생했습니다 (DB 조회 실패). 관리자에게 문의하세요.");
    }
}

// Handle Social Signup Form Submit (Modal)
socialSignupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!auth.currentUser) return; // session lost

    const role = googleRole.value;
    const region = googleRegion.value;
    const school = googleSchool.value;

    if (!region || !school) {
        alert("모든 정보를 입력해주세요.");
        return;
    }

    try {
        await setDoc(doc(db, "users", auth.currentUser.uid), {
            email: auth.currentUser.email,
            role: role,
            region: region,
            school: school,
            createdAt: new Date(),
            authProvider: 'google'
        });

        additionalInfoModal.classList.add('hidden');
        alert("가입이 완료되었습니다.");
        redirectUser(role);

    } catch (error) {
        console.error("Error saving social user:", error);
        alert("정보 저장 실패. 다시 시도해주세요.");
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
        case 'custom/password-mismatch': return '비밀번호가 일치하지 않습니다.';
        default: return '로그인/회원가입 중 오류가 발생했습니다: ' + code;
    }
}

// Check Auth State on Load
// (Optional: can comment out if causing redirect loops during dev)
onAuthStateChanged(auth, async (user) => {
    // If on login page, we might want to redirect if already logged in AND has user doc
    if (user) {
        // const userDoc = await getDoc(doc(db, "users", user.uid));
        // if (userDoc.exists()) redirectUser(userDoc.data().role);
    }
});
