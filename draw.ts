type rgba = { r: number; g: number; b: number; a: number };

// ----- DOM Elements -----
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const brushSizeInput = document.getElementById("brushSize") as HTMLInputElement;
const brushColorInput = document.getElementById("brushColor") as HTMLInputElement;

let brushColor = brushColorInput.value;
let mouseDown = false;
let needsUpdate = false;
let img: ImageData;
let data: Uint8ClampedArray;

// ----- Utilities -----
function hexToRgba(hex: string, alpha: number = 255): rgba {
    hex = hex.replace(/^#/, "");
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b, a: alpha };
}

function getBrushColor(): rgba {
    return hexToRgba(brushColor, 255);
}

// ----- Drawing -----
function setPixel(x: number, y: number, color: rgba) {
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;
    const index = (y * canvas.width + x) * 4;
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = color.a;
    needsUpdate = true;
}

function drawBrush(x: number, y: number, color: rgba) {
    const brushSize = Number(brushSizeInput.value) || 5;
    const rSquared = brushSize * brushSize;
    for (let dx = -brushSize; dx <= brushSize; dx++) {
        for (let dy = -brushSize; dy <= brushSize; dy++) {
            if (dx * dx + dy * dy <= rSquared) {
                setPixel(x + dx, y + dy, color);
            }
        }
    }
}

// ----- Mouse handling -----
function drawAtMouse(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
    const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));
    drawBrush(x, y, getBrushColor());
}

canvas.addEventListener("mousedown", (e) => { mouseDown = true; drawAtMouse(e); });
canvas.addEventListener("mouseup", () => mouseDown = false);
canvas.addEventListener("mouseleave", () => mouseDown = false);
canvas.addEventListener("mousemove", (e) => { if (mouseDown) drawAtMouse(e); });

// ----- Canvas update loop -----
function updateLoop() {
    if (needsUpdate) {
        ctx.putImageData(img, 0, 0);
        
        needsUpdate = false;
    }
    brushColor = brushColorInput.value;
    requestAnimationFrame(updateLoop);
}

// ----- Reset canvas -----
function Reset() {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Get fresh imageData
    img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    data = img.data;
    needsUpdate = true;
}

// Make Reset globally available for onclick
(window as any).Reset = Reset;

// ----- Initialize -----
window.onload = () => {
    Reset();
    updateLoop();
};
