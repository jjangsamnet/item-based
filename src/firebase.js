import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAnalytics } from "firebase/analytics";

// Config from User
const firebaseConfig = {
  apiKey: "AIzaSyBa3bdefIKJuIqGHOqk608Zu4IcToo56Ss",
  authDomain: "item-based.firebaseapp.com",
  projectId: "item-based",
  storageBucket: "item-based.firebasestorage.app",
  messagingSenderId: "817296899475",
  appId: "1:817296899475:web:1c2beaa2840f47420cfc66",
  measurementId: "G-5T7TMCF0Y3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);
const analytics = getAnalytics(app);
const googleProvider = new GoogleAuthProvider();

export { auth, db, storage, analytics, googleProvider };
