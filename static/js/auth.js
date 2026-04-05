import { auth, db } from './firebase_config.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// Signup Logic
const signupForm = document.getElementById('signup-form');
if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = signupForm.querySelector('input[type="text"]').value;
        const email = signupForm.querySelector('input[type="email"]').value;
        const password = signupForm.querySelector('input[type="password"]').value;

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            console.log("Registered:", userCredential.user);
            window.location.href = "/dashboard";
        } catch (error) {
            console.error(error.message);
            alert("Signup failed: " + error.message);
        }
    });
}

// Login Logic
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.querySelector('input[type="email"]').value;
        const password = loginForm.querySelector('input[type="password"]').value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = "/dashboard";
        } catch (error) {
            console.error(error.message);
            alert("Login failed: " + error.message);
        }
    });
}

// Global Auth State Tracking
onAuthStateChanged(auth, (user) => {
    const userImg = document.querySelector('.user-profile img');
    if (user) {
        if (userImg) userImg.src = `https://ui-avatars.com/api/?name=${user.email}&background=0D8ABC&color=fff`;
        // Handle logic if user is logged in
    } else {
        // Redirect if on dashboard without auth
        if (window.location.pathname === '/dashboard') {
            window.location.href = '/login';
        }
    }
});
