/**
 * Script.js - Main entry point and UI interactions.
 */

// Initialize Socket.io
const socket = io();

// Configure whiteboard with socket
window.whiteboard.socket = socket;

// Synchronize drawing events
socket.on('draw_update', (data) => {
    if (data.type === 'start') {
        window.whiteboard.isDrawing = true;
        window.whiteboard.lastPoint = { x: data.x, y: data.y };
        window.whiteboard.ctx.beginPath();
        window.whiteboard.ctx.moveTo(data.x, data.y);
    } else if (data.type === 'draw') {
        window.whiteboard.draw(null, true, data);
    } else if (data.type === 'stop') {
        window.whiteboard.isDrawing = false;
        window.whiteboard.lastPoint = null;
        window.whiteboard.ctx.closePath();
    }
});

socket.on('draw_batch_update', (data) => {
    if (!data.points || data.points.length === 0) return;
    
    // Draw each point in the batch
    data.points.forEach(point => {
        window.whiteboard.draw(null, true, point);
    });
});

socket.on('draw_shape_update', (data) => {
    const origTool = window.whiteboard.currentTool;
    const origColor = window.whiteboard.currentColor;
    const origSize = window.whiteboard.currentSize;
    
    window.whiteboard.setTool(data.type);
    window.whiteboard.setColor(data.color);
    window.whiteboard.setSize(data.size);
    
    window.whiteboard.replaceWithShape(data.type, ...data.params);
    
    // Restore
    window.whiteboard.setTool(origTool);
    window.whiteboard.setColor(origColor);
    window.whiteboard.setSize(origSize);
});

socket.on('clear_board', () => {
    window.whiteboard.clear(false);
});

// UI Event Handlers
document.querySelectorAll('.tool-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        const tool = e.currentTarget.id;
        
        if (['pencil', 'pen', 'marker', 'eraser', 'laser', 'rect', 'circle', 'triangle', 'line'].includes(tool)) {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            window.whiteboard.setTool(tool);
        } else if (tool === 'undo') {
            window.whiteboard.undo();
        } else if (tool === 'redo') {
            window.whiteboard.redo();
        } else if (tool === 'clear-board') {
            if (confirm("Are you sure you want to clear the entire board?")) {
                window.whiteboard.clear();
            }
        } else if (tool === 'zoom-in') {
            const centerX = window.innerWidth / 2;
            const centerY = (window.innerHeight - 70) / 2;
            window.whiteboard.zoom(1, centerX, centerY);
            showNotification(`Zoom: ${Math.round(window.whiteboard.scale * 100)}%`, "info");
        } else if (tool === 'zoom-out') {
            const centerX = window.innerWidth / 2;
            const centerY = (window.innerHeight - 70) / 2;
            window.whiteboard.zoom(-1, centerX, centerY);
            showNotification(`Zoom: ${Math.round(window.whiteboard.scale * 100)}%`, "info");
        } else if (tool === 'fullscreen') {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen();
                e.currentTarget.innerHTML = '<i class="fas fa-compress"></i>';
            } else {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                    e.currentTarget.innerHTML = '<i class="fas fa-expand"></i>';
                }
            }
        } else if (tool === 'import-image-btn') {
            document.getElementById('image-loader').click();
        }
    });
});

// Image Import Logic
document.getElementById('image-loader').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            window.whiteboard.drawImage(event.target.result);
        };
        reader.readAsDataURL(file);
    }
});

// Sync Image from others
socket.on('draw_image', (data) => {
    window.whiteboard.drawImage(data.imgData, data.x, data.y, false);
});

// Sync Text from others
socket.on('draw_text', (data) => {
    const originalText = window.whiteboard.textRecognitionEnabled;
    window.whiteboard.textRecognitionEnabled = false; // Prevent loop
    window.whiteboard.replaceWithText(data.text, [ {x: data.x, y: data.y} ]);
    window.whiteboard.textRecognitionEnabled = originalText;
});

// Add Mouse Wheel Zoom support (like Paint/Photoshop)
window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) { // Zoom on Ctrl+Wheel
        e.preventDefault();
        const centerX = e.clientX;
        const centerY = e.clientY - 70;
        window.whiteboard.zoom(e.deltaY < 0 ? 1 : -1, centerX, centerY);
    }
}, { passive: false });

// --- Shapes Library Panel Logic ---
const shapesTrigger = document.getElementById('shapes-trigger');
const shapesPanel = document.getElementById('shapes-panel');
const shapeItems = document.querySelectorAll('.shape-item');

if (shapesTrigger && shapesPanel) {
    shapesTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        shapesPanel.classList.toggle('show');
        shapesTrigger.classList.toggle('active', shapesPanel.classList.contains('show'));
    });

    shapeItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            const shapeType = item.getAttribute('data-shape');
            
            // Clear other tool actives
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            shapeItems.forEach(i => i.classList.remove('active'));
            
            // Set this as active
            item.classList.add('active');
            shapesTrigger.classList.add('active');
            
            window.whiteboard.setTool(shapeType);
            shapesPanel.classList.remove('show');
            
            showNotification(`Selected ${shapeType.replace('-', ' ')} tool`, "info");
        });
    });

    // Close on click outside
    document.addEventListener('click', (e) => {
        if (shapesPanel.classList.contains('show') && !shapesPanel.contains(e.target)) {
            shapesPanel.classList.remove('show');
            shapesTrigger.classList.remove('active');
        }
    });
}

document.getElementById('color-picker').addEventListener('input', (e) => {
    window.whiteboard.setColor(e.target.value);
});

document.getElementById('brush-size').addEventListener('input', (e) => {
    const val = e.target.value;
    window.whiteboard.setSize(val);
    document.getElementById('brush-val').innerText = val;
});

document.getElementById('export-btn').addEventListener('click', () => {
    window.whiteboard.exportToImage();
});

// Profile Dropdown Toggle
const profileTrigger = document.getElementById('profile-trigger');
const profileDropdown = document.getElementById('profile-dropdown');

if (profileTrigger && profileDropdown) {
    profileTrigger.addEventListener('click', (e) => {
        e.stopPropagation();
        profileDropdown.classList.toggle('show');
    });

    // Close dropdown when clicking outside
    window.addEventListener('click', (e) => {
        if (!profileDropdown.contains(e.target)) {
            profileDropdown.classList.remove('show');
        }
    });
}

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        showNotification("Logging out...", "info");
        setTimeout(() => {
            window.location.href = '/login';
        }, 1000);
    });
}

// Notifications
function showNotification(msg, type = 'info') {
    const container = document.getElementById('notification-container');
    const toast = document.createElement('div');
    toast.className = `notification border-${type}`;
    toast.innerHTML = `<span><i class="fas fa-info-circle"></i> ${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Initial Greeting
document.addEventListener('DOMContentLoaded', () => {
    showNotification("Welcome to AI Whiteboard! Use gestures or mouse to draw.", "success");
    
    // Joint a default room for collaboration
    socket.emit('join', { username: 'Guest', room: 'default' });
});

// MediaRecorder setup for Screen Recording
let mediaRecorder;
let recordedChunks = [];
const recordBtn = document.getElementById('record-btn');

recordBtn.addEventListener('click', async () => {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        recordBtn.innerHTML = '<i class="fas fa-video"></i> Record';
        recordBtn.classList.remove('recording');
        recordBtn.style.color = 'white';
        showNotification("Processing and Uploading Recording...", "info");
    } else {
        try {
            // Include audio if available
            const stream = await navigator.mediaDevices.getDisplayMedia({ 
                video: { cursor: "always" },
                audio: true 
            });
            
            mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'video/webm;codecs=vp9,opus'
            });
            recordedChunks = [];
            
            mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) recordedChunks.push(e.data);
            };
            
            mediaRecorder.onstop = async () => {
                const blob = new Blob(recordedChunks, { type: 'video/webm' });
                
                // Upload to server
                const formData = new FormData();
                formData.append('video', blob, 'recording.webm');
                
                try {
                    const response = await fetch('/api/upload_recording', {
                        method: 'POST',
                        body: formData
                    });
                    const result = await response.json();
                    if (result.status === 'success') {
                        showNotification("Recording Saved to Dashboard!", "success");
                    } else {
                        showNotification("Failed to save recording", "error");
                    }
                } catch (err) {
                    console.error("Upload error:", err);
                    showNotification("Upload failed", "error");
                }

                // Stop all tracks to release the screen
                stream.getTracks().forEach(track => track.stop());
            };
            
            mediaRecorder.start();
            recordBtn.innerHTML = '<i class="fas fa-stop"></i> Stop';
            recordBtn.classList.add('recording');
            recordBtn.style.color = '#ff4b2b';
            
            // Global flag for other scripts to check
            window.isRecording = true;
            
            showNotification("Recording Started", "success");
            
            // Handle unexpected stream stop (e.g. user clicks "Stop Sharing" in browser)
            stream.getVideoTracks()[0].onended = () => {
                if (mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    recordBtn.innerHTML = '<i class="fas fa-video"></i> Record';
                    recordBtn.classList.remove('recording');
                    recordBtn.style.color = 'white';
                    window.isRecording = false;
                }
            };

        } catch (err) {
            console.error("Error accessing display media:", err);
            showNotification("Permission denied or error starting recording", "error");
            window.isRecording = false;
        }
    }
});
