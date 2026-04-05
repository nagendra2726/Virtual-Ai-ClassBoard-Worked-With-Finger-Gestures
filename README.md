# AI Gesture Controlled Whiteboard

A cutting-edge, real-time collaborative whiteboard powered by Computer Vision and AI. Control your drawing experience using simple hand gestures detected via your webcam.

## 🚀 Features

### 🖐️ Gesture Controls
- **Index Finger**: Draw smoothly on the canvas.
- **Index + Middle Fingers**: Erase content precisely.
- **Three Fingers**: Cycle through drawing tools (Pen, Marker, Pencil).
- **Open Palm**: Take an instant screenshot of your masterpiece.
- **Pinch (Index + Thumb)**: Pause or resume writing.
- **Swipe Hand**: Navigate through slides or pages (future expansion).

### 🤖 AI & Computer Vision
- **MediaPipe Integration**: Robust and high-performance hand landmark detection.
- **Smoothing**: Implemented moving average filters for stable, jitter-free pointer movement.
- **Shape Recognition**: Automatically detects and rectifies hand-drawn circles, rectangles, and lines into clean geometric shapes.
- **Low-light Optimization**: Optimized tracking profiles for varied lighting conditions.

### 💻 Tech Stack
- **Backend**: Python with Flask & Flask-SocketIO for real-time bi-directional communication.
- **Frontend**: HTML5 Canvas, CSS3 (Glassmorphism & Neon UI), JavaScript.
- **Cloud**: Firebase Auth, Firestore, and Cloud Storage integration.
- **Analytics**: Chart.js for usage and session tracking.

### 🎨 Design & UX
- Modern AI-inspired theme with blue/neon gradients.
- Fully responsive layout for all device types.
- Glassmorphism effects for toolbars and panels.
- Live webcam overlay in the bottom-right corner.
- Notification system for user feedback.

## 📂 Project Structure
```text
.
├── app.py              # Flask server & SocketIO events
├── requirements.txt     # Python dependencies
├── static/              
│   ├── css/style.css    # Premium Glassmorphism UI
│   └── js/
│       ├── whiteboard.js # Canvas logic & Shape detection
│       ├── gestures.js   # MediaPipe & Gesture recognition
│       ├── script.js     # UI & SocketIO bridge
│       └── firebase_config.js # Cloud integration
├── templates/           
│   ├── index.html       # Main Editor
│   ├── dashboard.html   # User Analytics & History
│   ├── login.html       # Auth
│   └── signup.html      # Auth
└── README.md
```

## 🛠️ Getting Started

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd "Final Year Project"
   ```

2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

3. **Firebase Setup**:
   - Create a project on [Firebase Console](https://console.firebase.google.com/).
   - Copy your config into `static/js/firebase_config.js`.

4. **Run the Application**:
   ```bash
   python app.py
   ```
   Open `http://localhost:5000` in your browser.

## 📈 Analytics Dashboard
Monitor your usage time, session counts, and whiteboard history via the integrated dashboard. Visualize your creative activity with dynamic line charts.

## 📄 License
This project is developed for educational purposes as part of the Final Year Project.
