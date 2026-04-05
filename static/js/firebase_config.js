/**
 * Firebase-config.js - Firebase initialization and helper functions.
 * Replace with your actual Firebase project config.
 */

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { getStorage, ref, uploadString, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
    apiKey: "AIzaSyBF8rR5xBXsmTdn7tnEDsdmxkdMKKaCXcI",
    authDomain: "airwrite-ai.firebaseapp.com",
    projectId: "airwrite-ai",
    storageBucket: "airwrite-ai.firebasestorage.app",
    messagingSenderId: "607706442263",
    appId: "1:607706442263:web:2ae7c130b9c82bc2878a52"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export const saveWhiteboardToCloud = async (userId, name, dataURL) => {
    try {
        const storageRef = ref(storage, `whiteboards/${userId}/${name}-${Date.now()}.png`);
        await uploadString(storageRef, dataURL, 'data_url');
        const downloadURL = await getDownloadURL(storageRef);
        
        await addDoc(collection(db, "whiteboards"), {
            userId,
            name,
            imageUrl: downloadURL,
            timestamp: new Date()
        });
        return true;
    } catch (error) {
        console.error("Error saving to cloud:", error);
        return false;
    }
};
