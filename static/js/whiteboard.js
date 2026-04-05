/**
 * Whiteboard.js - Core canvas drawing and real-time syncing logic.
 */

class Whiteboard {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.isDrawing = false;
        this.shapeDetectionEnabled = true;
        this.drawingPoints = []; // Collect points for shape recognition
        this.currentTool = 'pencil';
        this.currentColor = '#004cff';
        this.currentSize = 2; // Default to a thinner profile
        this.history = [];
        this.redoStack = [];
        this.socket = null;
        this.room = 'default';
        this.laserTrail = [];
        this.textRecognitionEnabled = false;
        this.recognitionTimer = null;
        this.lastDrawnPoints = []; 
        
        // Zoom and Pan Properties
        this.scale = 1.0;
        this.offsetX = 0;
        this.offsetY = 0;
        this.isPanning = false;
        this.lastMouseX = 0;
        this.lastMouseY = 0;

        // Layered Canvases
        this.bgCanvas = document.getElementById('bg-canvas');
        this.bgCtx = this.bgCanvas.getContext('2d');
        this.overlayCanvas = document.getElementById('overlay-canvas');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        
        this.socketBuffer = []; 
        this.batchInterval = setInterval(() => this.flushSocketBuffer(), 20); // 50fps
        
        this.startPoint = null;
        this.isShapeTool = false;
        
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());

        // Event listeners for drawing
        this.canvas.addEventListener('mousedown', (e) => this.startDrawing(e));
        this.canvas.addEventListener('mousemove', (e) => this.draw(e));
        this.canvas.addEventListener('mouseup', () => this.stopDrawing());
        this.canvas.addEventListener('mouseout', () => this.stopDrawing());

        // Setup SocketIO (to be initialized by script.js)
        this.lastPoint = null;
    }

    flushSocketBuffer() {
        if (this.socket && this.socketBuffer.length > 0) {
            this.socket.emit('draw_batch', {
                points: this.socketBuffer,
                room: this.room
            });
            this.socketBuffer = [];
        }
    }

    drawBackground() {
        this.bgCtx.clearRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
        this.bgCtx.fillStyle = "#ffffff";
        this.bgCtx.fillRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
        this.bgCtx.fillStyle = "rgba(10, 12, 18, 0.08)";
        const dotSpacing = 40;
        for (let x = 0; x < this.bgCanvas.width; x += dotSpacing) {
            for (let y = 0; y < this.bgCanvas.height; y += dotSpacing) {
                this.bgCtx.beginPath();
                this.bgCtx.arc(x + 1, y + 1, 1, 0, Math.PI * 2);
                this.bgCtx.fill();
            }
        }
        // Also clear main canvas initially (important for destination-out)
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    resizeCanvas() {
        const tempImage = this.canvas.toDataURL();
        const w = window.innerWidth;
        const h = window.innerHeight - 70;
        
        [this.canvas, this.overlayCanvas, this.bgCanvas].forEach(c => {
            c.width = w;
            c.height = h;
        });

        this.drawBackground();
        const img = new Image();
        img.src = tempImage;
        img.onload = () => this.ctx.drawImage(img, 0, 0);
    }

    setTool(tool) {
        this.currentTool = tool;
        if (tool === 'pen') this.currentSize = 1.5;
        else if (tool === 'pencil') this.currentSize = 2.5;
        else if (tool === 'marker') this.currentSize = 8;
        else if (tool === 'laser') this.currentSize = 5;
        else if (tool === 'eraser') this.currentSize = 30;
        
        const slider = document.getElementById('brush-size');
        const valDisp = document.getElementById('brush-val');
        if (slider && valDisp) { slider.value = this.currentSize; valDisp.innerText = this.currentSize; }
    }

    setColor(color) { this.currentColor = color; }
    setSize(size) { this.currentSize = size; }

    startDrawing(e) {
        if (this.isPanning) return;
        this.isDrawing = true;
        const pos = this.getTransformedPoint(e.clientX, e.clientY - 70);
        this.startPoint = pos;
        this.lastPoint = pos;
        this.drawingPoints = [pos];
        this.saveState();
        
        // Check if current tool is a shape
        const shapeTools = ['rect', 'circle', 'triangle', 'line', 'diamond', 'pentagon', 'hexagon', 'star', 'heart', 'cloud', 'arrow-right', 'arrow-left', 'arrow-up', 'arrow-down', 'plus', 'minus', 'multiply', 'divide', 'line-arrow'];
        this.isShapeTool = shapeTools.includes(this.currentTool);

        if (!this.isShapeTool) {
            this.ctx.beginPath();
            this.ctx.moveTo(pos.x, pos.y);
        }
        
        if (this.socket) {
            this.socket.emit('draw', {
                type: 'start', tool: this.currentTool, color: this.currentColor,
                size: this.currentSize, x: pos.x, y: pos.y, room: this.room
            });
        }
    }

    draw(e, fromRemote = false, data = null) {
        if (!this.isDrawing && !fromRemote) return;
        let x, y;
        if (fromRemote) { x = data.x; y = data.y; }
        else {
            const pos = this.getTransformedPoint(e.clientX, e.clientY - 70);
            x = pos.x; y = pos.y;
        }

        const tool = fromRemote ? data.tool : this.currentTool;
        const color = fromRemote ? data.color : this.currentColor;
        const size = fromRemote ? data.size : this.currentSize;

        // SHAPE TOOL PREVIEW
        if (this.isShapeTool && !fromRemote) {
            this.drawShapePreview(this.startPoint.x, this.startPoint.y, x, y, tool);
            return;
        }

        const isEraser = (tool === 'eraser');
        
        // STANDARD DRAWING
        if (this.lastPoint) {
            const dist = Math.hypot(x - this.lastPoint.x, y - this.lastPoint.y);
            if (dist < 0.1) return; 

            const midPoint = { x: (this.lastPoint.x + x) / 2, y: (this.lastPoint.y + y) / 2 };
            
            this.ctx.save();
            this.ctx.lineWidth = isEraser ? size * 3 : size;
            this.ctx.lineCap = 'round';
            this.ctx.lineJoin = 'round';
            
            if (isEraser) {
                this.ctx.globalCompositeOperation = 'destination-out';
                this.ctx.strokeStyle = 'rgba(0,0,0,1)';
            } else {
                this.ctx.globalCompositeOperation = 'source-over';
                this.ctx.strokeStyle = (tool === 'laser') ? '#ff0000' : color;
                if (tool === 'laser') { this.ctx.shadowBlur = 15; this.ctx.shadowColor = '#ff0000'; }
            }

            this.ctx.quadraticCurveTo(this.lastPoint.x, this.lastPoint.y, midPoint.x, midPoint.y);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.moveTo(midPoint.x, midPoint.y);
            this.ctx.restore();
            
            this.lastPoint = { x, y };
        } else {
            this.lastPoint = { x, y };
        }

        if (!fromRemote) {
            this.drawingPoints.push({ x, y });
            if (this.socket) this.socketBuffer.push({ x, y, tool, color, size });
        }
    }

    stopDrawing() {
        if (this.isDrawing) {
            if (this.isShapeTool && this.lastPoint) {
                this.finalizeShape(this.startPoint.x, this.startPoint.y, this.lastPoint.x, this.lastPoint.y, this.currentTool);
            } else if (this.lastPoint) {
                this.ctx.lineTo(this.lastPoint.x, this.lastPoint.y);
                this.ctx.stroke();
            }
            this.ctx.closePath();
            this.isDrawing = false;
            this.lastPoint = null;
            this.startPoint = null;
            if (this.socket) this.socket.emit('draw', { type: 'stop', room: this.room });
        }
    }

    drawShapePreview(x1, y1, x2, y2, type) {
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        this.overlayCtx.save();
        this.overlayCtx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
        
        this.overlayCtx.beginPath();
        this.overlayCtx.lineWidth = this.currentSize;
        this.overlayCtx.strokeStyle = this.currentColor;
        this.overlayCtx.setLineDash([5, 5]); // Preview dash

        this.drawShapeLogic(this.overlayCtx, x1, y1, x2, y2, type);
        
        this.overlayCtx.stroke();
        this.overlayCtx.restore();
        this.lastPoint = { x: x2, y: y2 }; // Store final for mouseup
    }

    finalizeShape(x1, y1, x2, y2, type) {
        this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.lineWidth = this.currentSize;
        this.ctx.strokeStyle = this.currentColor;
        this.ctx.setLineDash([]); // Solid final line

        this.drawShapeLogic(this.ctx, x1, y1, x2, y2, type);
        
        this.ctx.stroke();
        this.ctx.restore();
        this.saveState();

        if (this.socket) {
            this.socket.emit('draw_shape', { 
                type, 
                params: [x1, y1, x2, y2], 
                color: this.currentColor, 
                size: this.currentSize, 
                room: this.room 
            });
        }
    }

    drawShapeLogic(ctx, x1, y1, x2, y2, type) {
        const w = x2 - x1;
        const h = y2 - y1;
        const cx = x1 + w / 2;
        const cy = y1 + h / 2;

        if (type === 'line') {
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);
        } else if (type === 'rect') {
            ctx.rect(x1, y1, w, h);
        } else if (type === 'circle') {
            const radius = Math.hypot(w, h);
            ctx.arc(x1, y1, radius, 0, 2 * Math.PI);
        } else if (type === 'triangle') {
            ctx.moveTo(cx, y1);
            ctx.lineTo(x1, y2);
            ctx.lineTo(x2, y2);
            ctx.closePath();
        } else if (type === 'diamond') {
            ctx.moveTo(cx, y1);
            ctx.lineTo(x2, cy);
            ctx.lineTo(cx, y2);
            ctx.lineTo(x1, cy);
            ctx.closePath();
        } else if (type === 'pentagon') {
            this.drawPolygon(ctx, cx, cy, 5, Math.hypot(w, h) / 2);
        } else if (type === 'hexagon') {
            this.drawPolygon(ctx, cx, cy, 6, Math.hypot(w, h) / 2);
        } else if (type === 'star') {
            this.drawStar(ctx, cx, cy, 5, Math.hypot(w, h) / 2, Math.hypot(w, h) / 4);
        } else if (type === 'heart') {
            this.drawHeart(ctx, x1, y1, w, h);
        } else if (type === 'cloud') {
            this.drawCloud(ctx, x1, y1, w, h);
        } else if (type.startsWith('arrow-')) {
            this.drawArrow(ctx, x1, y1, x2, y2, type.split('-')[1]);
        } else if (['plus', 'minus', 'multiply', 'divide'].includes(type)) {
            this.drawMath(ctx, x1, y1, x2, y2, type);
        } else if (type === 'line-arrow') {
            this.drawArrowLine(ctx, x1, y1, x2, y2);
        }
    }

    drawPolygon(ctx, cx, cy, sides, radius) {
        for (let i = 0; i < sides; i++) {
            const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
    }

    drawStar(ctx, cx, cy, spikes, outerRadius, innerRadius) {
        let rot = Math.PI / 2 * 3;
        let x = cx;
        let y = cy;
        let step = Math.PI / spikes;

        ctx.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
            x = cx + Math.cos(rot) * outerRadius;
            y = cy + Math.sin(rot) * outerRadius;
            ctx.lineTo(x, y);
            rot += step;

            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            ctx.lineTo(x, y);
            rot += step;
        }
        ctx.lineTo(cx, cy - outerRadius);
        ctx.closePath();
    }

    drawHeart(ctx, x, y, w, h) {
        ctx.moveTo(x + 0.5 * w, y + 0.3 * h);
        ctx.bezierCurveTo(x + 0.2 * w, y, x, y + 0.6 * h, x + 0.5 * w, y + 0.9 * h);
        ctx.bezierCurveTo(x + w, y + 0.6 * h, x + 0.8 * w, y, x + 0.5 * w, y + 0.3 * h);
    }

    drawCloud(ctx, x, y, w, h) {
        ctx.moveTo(x + 0.15 * w, y + 0.7 * h);
        ctx.bezierCurveTo(x - 0.05 * w, y + 0.5 * h, x + 0.1 * w, y + 0.2 * h, x + 0.3 * w, y + 0.35 * h);
        ctx.bezierCurveTo(x + 0.35 * w, y + 0.05 * h, x + 0.7 * w, y + 0.1 * h, x + 0.75 * w, y + 0.3 * h);
        ctx.bezierCurveTo(x + 1.05 * w, y + 0.3 * h, x + 1.05 * w, y + 0.7 * h, x + 0.8 * w, y + 0.7 * h);
        ctx.closePath();
    }

    drawArrow(ctx, x1, y1, x2, y2, dir) {
        const w = x2 - x1;
        const h = y2 - y1;
        const head = 0.3;
        if (dir === 'right') {
            ctx.moveTo(x1, y1 + 0.3 * h);
            ctx.lineTo(x1 + 0.7 * w, y1 + 0.3 * h);
            ctx.lineTo(x1 + 0.7 * w, y1);
            ctx.lineTo(x2, y1 + 0.5 * h);
            ctx.lineTo(x1 + 0.7 * w, y2);
            ctx.lineTo(x1 + 0.7 * w, y1 + 0.7 * h);
            ctx.lineTo(x1, y1 + 0.7 * h);
        } else if (dir === 'left') {
            ctx.moveTo(x2, y1 + 0.3 * h);
            ctx.lineTo(x1 + 0.3 * w, y1 + 0.3 * h);
            ctx.lineTo(x1 + 0.3 * w, y1);
            ctx.lineTo(x1, y1 + 0.5 * h);
            ctx.lineTo(x1 + 0.3 * w, y2);
            ctx.lineTo(x1 + 0.3 * w, y1 + 0.7 * h);
            ctx.lineTo(x2, y1 + 0.7 * h);
        } else if (dir === 'up') {
            ctx.moveTo(x1 + 0.3 * w, y2);
            ctx.lineTo(x1 + 0.3 * w, y1 + 0.3 * h);
            ctx.lineTo(x1, y1 + 0.3 * h);
            ctx.lineTo(x1 + 0.5 * w, y1);
            ctx.lineTo(x2, y1 + 0.3 * h);
            ctx.lineTo(x1 + 0.7 * w, y1 + 0.3 * h);
            ctx.lineTo(x1 + 0.7 * w, y2);
        } else if (dir === 'down') {
            ctx.moveTo(x1 + 0.3 * w, y1);
            ctx.lineTo(x1 + 0.3 * w, y1 + 0.7 * h);
            ctx.lineTo(x1, y1 + 0.7 * h);
            ctx.lineTo(x1 + 0.5 * w, y2);
            ctx.lineTo(x2, y1 + 0.7 * h);
            ctx.lineTo(x1 + 0.7 * w, y1 + 0.7 * h);
            ctx.lineTo(x1 + 0.7 * w, y1);
        }
        ctx.closePath();
    }

    drawMath(ctx, x1, y1, x2, y2, type) {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const r = Math.min(Math.abs(x2 - x1), Math.abs(y2 - y1)) / 2;
        if (type === 'plus') {
            ctx.moveTo(cx, cy - r); ctx.lineTo(cx, cy + r);
            ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
        } else if (type === 'minus') {
            ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
        } else if (type === 'multiply') {
            ctx.moveTo(cx - r, cy - r); ctx.lineTo(cx + r, cy + r);
            ctx.moveTo(cx + r, cy - r); ctx.lineTo(cx - r, cy + r);
        } else if (type === 'divide') {
            ctx.moveTo(cx - r, cy); ctx.lineTo(cx + r, cy);
            ctx.arc(cx, cy - r / 2, 2, 0, Math.PI * 2);
            ctx.moveTo(cx, cy + r / 2);
            ctx.arc(cx, cy + r / 2, 2, 0, Math.PI * 2);
        }
    }

    drawArrowLine(ctx, x1, y1, x2, y2) {
        const headlen = 15;
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(x2, y2);
        ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
    }

    drawAt(x, y, isFirstPoint = false) {
        if (isFirstPoint) {
            this.isDrawing = true;
            this.lastPoint = null;
            const pos = this.getTransformedPoint(x, y);
            this.startDrawing({ clientX: x, clientY: y + 70 });
        } else {
            this.draw({ clientX: x, clientY: y + 70 });
        }
    }

    // --- ZOOM LOGIC ---
    getTransformedPoint(x, y) {
        // Convert screen coordinates to world coordinates
        return {
            x: (x - this.offsetX) / this.scale,
            y: (y - this.offsetY) / this.scale
        };
    }

    zoom(delta, centerX, centerY) {
        const zoomFactor = delta > 0 ? 1.1 : 0.9;
        const newScale = this.scale * zoomFactor;
        
        // Clamp scale
        if (newScale < 0.1 || newScale > 10) return;

        // Adjust offsets to zoom towards center
        this.offsetX = centerX - (centerX - this.offsetX) * (newScale / this.scale);
        this.offsetY = centerY - (centerY - this.offsetY) * (newScale / this.scale);
        this.scale = newScale;

        this.applyTransformAndRedraw();
    }

    applyTransformAndRedraw() {
        // Redraw everything with new transform
        const currentState = this.canvas.toDataURL();
        this.loadState(currentState); // This calls applyTransform()
    }

    applyTransform() {
        this.ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
    }

    drawImage(imgData, x = null, y = null, sync = true) {
        const img = new Image();
        img.src = imgData;
        img.onload = () => {
            // Calculate center if x/y not provided
            const drawX = x === null ? (this.canvas.width / 2 - (img.width * 0.5) / 2) : x;
            const drawY = y === null ? (this.canvas.height / 2 - (img.height * 0.5) / 2) : y;
            
            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0); // Draw in screen space or world space? 
            // Better draw in world space for zoom consistency? 
            // Let's draw at current world pos
            const pos = x === null ? this.getTransformedPoint(window.innerWidth/2, (window.innerHeight-70)/2) : {x, y};
            
            this.applyTransform();
            // Scale image if too large
            const maxW = this.canvas.width * 0.8;
            const maxH = this.canvas.height * 0.8;
            let finalW = img.width;
            let finalH = img.height;
            if (finalW > maxW) { finalH *= maxW/finalW; finalW = maxW; }
            if (finalH > maxH) { finalW *= maxH/finalH; finalH = maxH; }

            this.ctx.drawImage(img, pos.x - finalW/2, pos.y - finalH/2, finalW, finalH);
            this.ctx.restore();
            this.saveState();
            
            if (sync && this.socket) {
                this.socket.emit('draw_image', { 
                    imgData, 
                    x: pos.x - finalW/2, 
                    y: pos.y - finalH/2, 
                    w: finalW, 
                    h: finalH, 
                    room: this.room 
                });
            }
        };
    }

    stopGestureDrawing() {
        if (this.isDrawing || (this.drawingPoints && this.drawingPoints.length > 0)) {
            this.ctx.closePath();
            if (this.socket) {
                this.socket.emit('draw', { type: 'stop', room: this.room });
            }
            this.drawingPoints = [];
            this.isDrawing = false;
        }
        // Always reset to normal mode
        this.ctx.globalCompositeOperation = 'source-over';
    }

    saveState() {
        if (this.currentTool === 'laser') return;
        this.history.push(this.canvas.toDataURL());
        if (this.history.length > 50) this.history.shift();
        this.redoStack = [];
    }

    undo() {
        if (this.history.length > 0) {
            const prevState = this.history.pop();
            this.redoStack.push(this.canvas.toDataURL());
            this.loadState(prevState);
        }
    }

    redo() {
        if (this.redoStack.length > 0) {
            const nextState = this.redoStack.pop();
            this.history.push(this.canvas.toDataURL());
            this.loadState(nextState);
        }
    }

    loadState(dataURL) {
        const img = new Image();
        img.src = dataURL;
        img.onload = () => {
            this.drawBackground();
            this.ctx.save();
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            this.ctx.drawImage(img, 0, 0);
            this.ctx.restore();
            this.applyTransform();
        };
    }

    clear(notify = true) {
        this.drawBackground();
        this.saveState();
        if (notify && this.socket) this.socket.emit('clear', { room: this.room });
    }

    exportToImage() {
        const link = document.createElement('a');
        link.download = `whiteboard-${Date.now()}.png`;
        link.href = this.canvas.toDataURL();
        link.click();
    }
}

// Global instance to be used by other scripts
window.whiteboard = new Whiteboard('whiteboard');
