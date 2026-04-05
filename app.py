from flask import Flask, render_template, request, jsonify, send_from_directory
import os
import razorpay
import firebase_admin
from firebase_admin import credentials, firestore
import hashlib
import hmac
import json
import time
from flask_socketio import SocketIO, emit, join_room, leave_room
from flask_cors import CORS
import mimetypes
import datetime

# Initialize Razorpay client
RAZORPAY_KEY_ID = os.getenv('RAZORPAY_KEY_ID', 'rzp_test_SZrAXFzXFe6Vk2')
RAZORPAY_KEY_SECRET = os.getenv('RAZORPAY_KEY_SECRET', 'mmT1N8oltJxZwt5pflpghQkt')
razorpay_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))

# Initialize Firebase
cred = credentials.Certificate('serviceAccountKey.json')
firebase_admin.initialize_app(cred)

# Firestore DB
db = firestore.client()

# Subscription plan definitions (duration in days)
PLAN_DETAILS = {
    'monthly': 30,      # ₹99
    'quarterly': 90,    # ₹249
    'semiannual': 180,  # ₹449
    'annual': 365,      # ₹799
    'sixyear': 2190,    # ₹2999
}


app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")

# In-memory storage for whiteboard sessions (replace with DB for production)
sessions = {}

RECORDINGS_DIR = os.path.join(os.path.dirname(__file__), 'static', 'recordings')
if not os.path.exists(RECORDINGS_DIR):
    os.makedirs(RECORDINGS_DIR)



@app.route('/api/upload_recording', methods=['POST'])
def upload_recording():
    if 'video' not in request.files:
        return jsonify({'status': 'error', 'message': 'No video part'}), 400
    
    file = request.files['video']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'No selected file'}), 400
    
    import time
    filename = f"recording_{int(time.time())}.webm"
    save_path = os.path.join(RECORDINGS_DIR, filename)
    file.save(save_path)
    
    return jsonify({'status': 'success', 'filename': filename})

@app.route('/api/recordings')
def list_recordings():
    files = []
    if os.path.exists(RECORDINGS_DIR):
        files = [f for f in os.listdir(RECORDINGS_DIR) if f.endswith('.webm')]
        files.sort(reverse=True)
    return jsonify({'status': 'success', 'recordings': files})

@app.route('/api/delete_recording', methods=['POST'])
def delete_recording():
    data = request.get_json()
    filename = data.get('filename')
    if not filename:
        return jsonify({'status': 'error', 'message': 'No filename provided'}), 400
    
    file_path = os.path.join(RECORDINGS_DIR, filename)
    if os.path.exists(file_path):
        os.remove(file_path)
        return jsonify({'status': 'success', 'message': 'Recording deleted'})
    else:
        return jsonify({'status': 'error', 'message': 'File not found'}), 404

@app.route('/api/upload_file', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'status': 'error', 'message': 'No file part'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'status': 'error', 'message': 'No selected file'}), 400
    
    UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
    if not os.path.exists(UPLOAD_DIR):
        os.makedirs(UPLOAD_DIR)
        
    import time
    filename = f"upload_{int(time.time())}_{file.filename}"
    save_path = os.path.join(UPLOAD_DIR, filename)
    file.save(save_path)
    
    return jsonify({'status': 'success', 'filename': filename})

@app.route('/api/uploads')
def list_uploads():
    UPLOAD_DIR = os.path.join(os.path.dirname(__file__), 'static', 'uploads')
    files = []
    if os.path.exists(UPLOAD_DIR):
        files = [f for f in os.listdir(UPLOAD_DIR) if not f.startswith('.')]
        files.sort(reverse=True)
    return jsonify({'status': 'success', 'uploads': files})

@app.route('/api/free_trial', methods=['POST'])
def free_trial():
    data = request.json
    uid = data.get('uid')
    if not uid: return jsonify({'error': 'Missing UID'}), 400

    try:
        sub_ref = db.collection('subscriptions').document(uid)
        sub_snap = sub_ref.get()
        
        if sub_snap.exists:
            return jsonify({'error': 'You have already used a trial or have a subscription.'}), 400

        expiry_date = datetime.datetime.now() + datetime.timedelta(days=7)
        sub_ref.set({
            'userId': uid,
            'plan': 'trial',
            'amount': 0,
            'status': 'active',
            'created_at': datetime.datetime.now(),
            'expiry': expiry_date
        })
        return jsonify({'success': True, 'msg': '7-Day Free Trial activated!'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/static/recordings/<path:filename>')
def serve_recording(filename):
    return send_from_directory(RECORDINGS_DIR, filename, mimetype='video/webm')

@app.route('/static/uploads/<path:filename>')
def serve_upload(filename):
    import mimetypes
    mimetype, _ = mimetypes.guess_type(filename)
    return send_from_directory(os.path.join(os.path.dirname(__file__), 'static', 'uploads'), filename, mimetype=mimetype)

@app.route('/')
def index():
    return render_template('landing.html')

@app.route('/login')
def login_page():
    return render_template('login.html')

@app.route('/dashboard')
def dashboard_page():
    return render_template('dashboard.html')

@app.route('/profile')
def profile_page():
    return render_template('profile.html')

@app.route('/whiteboard')
def whiteboard_page():
    return render_template('index.html')

@app.route('/pricing')
def pricing_page():
    return render_template('pricing.html')

@app.route('/static/<path:path>')
def send_static(path):
    return send_from_directory('static', path)

# SocketIO Events
@socketio.on('connect')
def handle_connect():
    print(f'Client connected: {request.sid}')

@socketio.on('draw')
def handle_draw(data):
    room = data.get('room', 'default')
    emit('draw_update', data, room=room, include_self=False)

@socketio.on('draw_batch')
def handle_draw_batch(data):
    room = data.get('room', 'default')
    emit('draw_batch_update', data, room=room, include_self=False)

@socketio.on('draw_shape')
def handle_draw_shape(data):
    room = data.get('room', 'default')
    emit('draw_shape_update', data, room=room, include_self=False)

@socketio.on('draw_text')
def handle_draw_text(data):
    room = data.get('room', 'default')
    emit('draw_text_update', data, room=room, include_self=False)

@socketio.on('draw_image')
def handle_draw_image(data):
    room = data.get('room', 'default')
    emit('draw_image_update', data, room=room, include_self=False)

@socketio.on('join')
def on_join(data):
    username = data['username']
    room = data['room']
    join_room(room)
    print(f'{username} joined room: {room}')
    emit('status', {'msg': f'{username} has joined the room.'}, room=room)

@socketio.on('clear')
def handle_clear(data):
    room = data.get('room', 'default')
    emit('clear_board', {}, room=room)

@socketio.on('save')
def handle_save(data):
    # Logic to save whiteboard state to DB/Cloud
    print(f"Whiteboard saved for user: {data.get('user')}")
    emit('save_status', {'status': 'success', 'message': 'Whiteboard saved successfully!'})

# ---------- Subscription APIs ----------

@app.route('/api/create_order', methods=['POST'])
def create_order():
    data = request.get_json()
    uid = data.get('uid')
    email = data.get('email')
    plan = data.get('plan')
    amount = data.get('amount')
    if not all([uid, email, plan, amount]):
        return jsonify({'error': 'Missing parameters'}), 400
    # Amount in paise (robust float conversion)
    try:
        amount_paise = round(float(amount) * 100)
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid amount format'}), 400

    # Razorpay receipt max length is 40 characters
    short_uid = uid[-10:] if uid else "anon"
    receipt = f"rec_{short_uid}_{int(time.time())}"
    
    try:
        order = razorpay_client.order.create({
            'amount': amount_paise,
            'currency': 'INR',
            'receipt': receipt,
            'payment_capture': 1,
        })
        return jsonify({'order': order, 'email': email, 'uid': uid})
    except Exception as e:
        print(f"Razorpay Error (create_order): {str(e)}")
        return jsonify({'error': f"Payment Gateway Error: {str(e)}"}), 500

@app.route('/api/verify_payment', methods=['POST'])
def verify_payment():
    data = request.get_json()
    payment_id = data.get('razorpay_payment_id')
    order_id = data.get('razorpay_order_id')
    signature = data.get('razorpay_signature')
    uid = data.get('uid')
    email = data.get('email')
    plan = data.get('plan')
    amount = data.get('amount')
    # Verify signature
    generated_signature = hmac.new(
        bytes(RAZORPAY_KEY_SECRET, 'utf-8'),
        bytes(order_id + '|' + payment_id, 'utf-8'),
        hashlib.sha256
    ).hexdigest()
    if generated_signature != signature:
        return jsonify({'success': False, 'error': 'Invalid signature'}), 400
    # Compute expiry date
    import datetime
    days = PLAN_DETAILS.get(plan, 30)
    now = datetime.datetime.now()
    expiry_date = now + datetime.timedelta(days=days)
    
    # Store subscription
    sub_ref = db.collection('subscriptions').document(uid)
    sub_ref.set({
        'email': email,
        'plan': plan,
        'amount': amount,
        'status': 'active',
        'created_at': now,
        'expiry': expiry_date,
        'payment_id': payment_id,
        'order_id': order_id
    })
    
    return jsonify({'success': True, 'expiry': expiry_date.strftime('%Y-%m-%d')})

@app.route('/api/get_subscription', methods=['GET'])
def get_subscription():
    uid = request.args.get('uid')
    if not uid:
        return jsonify({'error': 'uid required'}), 400
    doc = db.collection('subscriptions').document(uid).get()
    if not doc.exists:
        return jsonify({'subscription': None})
    return jsonify({'subscription': doc.to_dict()})

if __name__ == '__main__':
    socketio.run(app, debug=True, port=5000)
# Firebase initialization handled earlier