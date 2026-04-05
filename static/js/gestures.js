/**
 * Gestures.js - Hand tracking and gesture logic using MediaPipe.
 */

import {
    HandLandmarker,
    FilesetResolver,
    DrawingUtils
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

const video = document.getElementById('webcam');
const canvasElement = document.getElementById('output_canvas');
const canvasCtx = canvasElement.getContext('2d');
const gestureNameDisplay = document.getElementById('gesture-name');
const gestureCursor = document.getElementById('gesture-cursor');

// Move drawing utils to a cleaner reference
let drawingUtils = null;

let handLandmarker = undefined;
let runningMode = "IMAGE";
let webcamRunning = false;
let lastVideoTime = -1;

const videoHeight = "210px";
const videoWidth = "280px";

// Adaptive Smoothing based on Velocity
let lastX = null;
let lastY = null;
let currentSmoothing = 0.5;

function smoothPointer(x, y) {
    if (lastX === null || lastY === null) {
        lastX = x; lastY = y;
        return { x, y };
    }
    
    const dist = Math.hypot(x - lastX, y - lastY);
    
    // ADJUST SMOOTHING: 
    // High velocity -> High factor (fast follow)
    // Low velocity -> Low factor (smooth stable)
    const targetSmoothing = dist > 20 ? 0.9 : 0.45;
    
    // Smooth transition to avoid snapping
    currentSmoothing += (targetSmoothing - currentSmoothing) * 0.15;
    
    lastX += (x - lastX) * currentSmoothing;
    lastY += (y - lastY) * currentSmoothing;
    
    return { x: lastX, y: lastY };
}

// MediaPipe Setup & Webcam Access
async function initializeHandLandmarker() {
    try {
        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );

        handLandmarker = await HandLandmarker.createFromOptions(vision, {
            baseOptions: {
                modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
                delegate: "GPU"
            },
            runningMode: "VIDEO",
            numHands: 2
        });

        drawingUtils = new DrawingUtils(canvasCtx);
        console.log("HandLandmarker loaded successfully.");

        // Webcam Access
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            enableWebcam();
        }
    } catch (error) {
        console.error("Initialization Failed:", error);
        gestureNameDisplay.innerText = "AI/Camera Init Failed";
    }
}

function enableWebcam() {
    if (!handLandmarker) {
        console.log("Wait! HandLandmarker not loaded yet.");
        return;
    }

    webcamRunning = true;
    const constraints = { video: true };
    navigator.mediaDevices.getUserMedia(constraints)
        .then((stream) => {
            video.srcObject = stream;
            video.addEventListener("loadeddata", predictWebcam);
        })
        .catch((err) => {
            console.error("Webcam access denied:", err);
            gestureNameDisplay.innerText = "Camera Access Denied";
        });
}

// Start Initialization
initializeHandLandmarker();

async function predictWebcam() {
    canvasElement.style.width = videoWidth;
    canvasElement.style.height = videoHeight;
    canvasElement.width = video.videoWidth;
    canvasElement.height = video.videoHeight;

    if (lastVideoTime !== video.currentTime) {
        lastVideoTime = video.currentTime;
        const results = handLandmarker.detectForVideo(video, performance.now());

        canvasCtx.save();
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

        if (results.landmarks && drawingUtils) {
            for (const landmarks of results.landmarks) {
                drawingUtils.drawConnectors(landmarks, HandLandmarker.HAND_CONNECTIONS, {
                    color: "#00d2ff",
                    lineWidth: 3
                });
                drawingUtils.drawLandmarks(landmarks, { color: "#3a7bd5", lineWidth: 1 });
                
                // Gesture Recognition
                detectGesture(landmarks);
            }
        } else {
            gestureCursor.style.display = 'none';
            gestureNameDisplay.innerText = "No Hand Detected";
            if (window.whiteboard) window.whiteboard.stopGestureDrawing(); 
        }
        canvasCtx.restore();
    }

    if (webcamRunning) {
        window.requestAnimationFrame(predictWebcam);
    }
}

// --- Gesture State & Debouncing ---
let isDrawing = false;
let isFirstPoint = true;
let lastStableGesture = "IDLE";
let gestureBuffer = [];
const bufferSize = 5; // Goldilocks zone for speed + stability

function getStableGesture(newGesture) {
    gestureBuffer.push(newGesture);
    if (gestureBuffer.length > bufferSize) gestureBuffer.shift();
    
    // Count occurrences
    const counts = {};
    gestureBuffer.forEach(g => counts[g] = (counts[g] || 0) + 1);
    
    // Require 75% confidence to switch
    const mostFrequent = Object.keys(counts).reduce((a, b) => (counts[a] || 0) > (counts[b] || 0) ? a : b);
    return counts[mostFrequent] >= (bufferSize * 0.75) ? mostFrequent : lastStableGesture;
}

function detectGesture(landmarks) {
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const thumbTip = landmarks[4];
    
    // Improved Coordinate Mapping (Sensitivity)
    // Using a wider 80% box for more natural movement reach
    let normX = (indexTip.x - 0.1) / 0.8; 
    let normY = (indexTip.y - 0.1) / 0.8; 
    
    normX = Math.max(0, Math.min(1, normX));
    normY = Math.max(0, Math.min(1, normY));

    // Scale to screen (mirrored X)
    const screenX = (1 - normX) * window.innerWidth;
    const screenY = normY * (window.innerHeight - 70); 

    const smoothed = smoothPointer(screenX, screenY);
    gestureCursor.style.left = `${smoothed.x}px`;
    gestureCursor.style.top = `${smoothed.y}px`;
    gestureCursor.style.display = 'block';

    // Highlight cursor size to match brush
    const sizeOffset = window.whiteboard ? window.whiteboard.currentSize * 2 : 10;
    gestureCursor.style.width = `${20 + sizeOffset}px`;
    gestureCursor.style.height = `${20 + sizeOffset}px`;

    const indexRaised = indexTip.y < landmarks[5].y - 0.07;
    const middleRaised = middleTip.y < landmarks[9].y - 0.07;
    const ringRaised = ringTip.y < landmarks[13].y - 0.07;
    const pinkyRaised = pinkyTip.y < landmarks[17].y - 0.07;
    const distThumbIndex = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
    const distIndexMiddle = Math.hypot(indexTip.x - middleTip.x, indexTip.y - middleTip.y);

    let rawGesture = "IDLE";
    if (distThumbIndex < 0.06) {
        rawGesture = "PAUSE";
    } else if (indexRaised && middleRaised && ringRaised && pinkyRaised) {
        rawGesture = "PALM";
    } else if (indexRaised && middleRaised && distIndexMiddle < 0.08) {
        // Only ERASE if fingers are both up AND relatively close
        rawGesture = "ERASE";
    } else if (indexRaised && (!middleRaised || distIndexMiddle > 0.12)) {
        // Only WRITING if index is up AND (middle is down OR middle is far away)
        rawGesture = "WRITING";
    }
    
    const stableGesture = getStableGesture(rawGesture);
    gestureNameDisplay.innerText = stableGesture;
    processGestureAction(stableGesture, smoothed.x, smoothed.y);
    lastStableGesture = stableGesture;
}

function processGestureAction(gesture, x, y) {
    // Reset path if tool changes mid-session
    if ((gesture === "WRITING" && lastStableGesture !== "WRITING") || 
        (gesture === "ERASE" && lastStableGesture !== "ERASE")) {
        isFirstPoint = true;
    }

    if (gesture === "WRITING") {
        window.whiteboard.setTool('pencil');
        window.whiteboard.drawAt(x, y, isFirstPoint);
        isDrawing = true;
        isFirstPoint = false;
    } else if (gesture === "ERASE") {
        window.whiteboard.setTool('eraser');
        window.whiteboard.drawAt(x, y, isFirstPoint);
        isDrawing = true;
        isFirstPoint = false;
    } else if (gesture === "PALM") {
        if (isDrawing) stopDrawingSession();
        // Don't take screenshots while recording
        if (lastStableGesture !== "PALM" && !window.isRecording) {
            window.whiteboard.exportToImage();
            showNotification("Screenshot Saved!", "success");
        }
    } else {
        if (isDrawing) stopDrawingSession();
    }
}

function stopDrawingSession() {
    if (window.whiteboard) window.whiteboard.stopGestureDrawing();
    isDrawing = false;
    isFirstPoint = true;
}

// Global Exit Key listener
document.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'q') {
        showNotification("Exiting to Home...", "info");
        setTimeout(() => {
            window.location.href = '/';
        }, 800);
    }
});

function showNotification(msg, type) {
    const container = document.getElementById('notification-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `notification border-${type}`;
    toast.innerHTML = `<span>${msg}</span><i class="fas fa-times"></i>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// MediaPipe Utils Needed for connection drawing
// Since we used vision_bundle, these might be global or we need to define/script include.
// In the vision bundle, they are often not exported globally like this.
// I'll add the necessary drawing helper functions or assume vision_bundle handles them.
