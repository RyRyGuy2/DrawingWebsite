type rgba = { r: number; g: number; b: number; a: number };

// ----- DOM Elements -----
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const brushSizeInput = document.getElementById("brushSize") as HTMLInputElement;
const brushColorInput = document.getElementById("brushColor") as HTMLInputElement;
const undoButton = document.getElementById("undoButton") as HTMLButtonElement;

let brushColor = brushColorInput.value;
let mouseDown = false;
let needsUpdate = false;
let img: ImageData;
let data: Uint8ClampedArray;
let pixelX: number;
let pixelY: number;
let strokeSnapshot: Uint8ClampedArray;

interface point {
    x: number;
    y: number;
    color: rgba;
}

type stroke = {
    points: point[];
    pointsBelow: point[];
    brushSize: number;
};

let strokes: stroke[] = [];
let currentStroke: stroke | null = null;

// ----- Utilities -----
function HexToRgba(hex: string, alpha: number = 255): rgba {
    hex = hex.replace(/^#/, "");
    if (hex.length === 3) hex = hex.split("").map(c => c + c).join("");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b, a: alpha };
}

function GetBrushColor(): rgba {
    return HexToRgba(brushColor, 255);
}

// ----- Drawing -----
function SetPixel(x: number, y: number, color: rgba) {
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;
    const index = (y * canvas.width + x) * 4;
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = color.a;
    needsUpdate = true;
}

function DrawBrush(x: number, y: number, color: rgba): point[] {
    const brushSize = Number(brushSizeInput.value) || 5;
    const rSquared = brushSize * brushSize;
    let points: point[] = [];

    for (let dx = -brushSize; dx <= brushSize; dx++) {
        for (let dy = -brushSize; dy <= brushSize; dy++) {
            if (dx * dx + dy * dy <= rSquared) {
                const px = x + dx;
                const py = y + dy;

                points.push({ x: px, y: py, color }); // painted color
                SetPixel(px, py, color);
            }
        }
    }

    return points;
}

// ----- Stroke Handling -----
function StartStroke(x: number, y: number, color: rgba) {
    currentStroke = {
        points: [],
        pointsBelow: [],
        brushSize: Number(brushSizeInput.value),
    };

    // Take snapshot of current canvas
    strokeSnapshot = new Uint8ClampedArray(data);

    function loop() {
        if (!mouseDown) {
            if (currentStroke && currentStroke.points.length > 0) {
                strokes.push(currentStroke);
            }
            currentStroke = null;
            return;
        }

        if (!currentStroke) return;

        const drawn = DrawBrush(pixelX, pixelY, color);

        for (const p of drawn) {
            // Only store pointsBelow the first time we draw that pixel
            if (!currentStroke.pointsBelow.some(bp => bp.x === p.x && bp.y === p.y)) {
                const index = (p.y * canvas.width + p.x) * 4;
                currentStroke.pointsBelow.push({
                    x: p.x,
                    y: p.y,
                    color: {
                        r: strokeSnapshot[index],
                        g: strokeSnapshot[index + 1],
                        b: strokeSnapshot[index + 2],
                        a: strokeSnapshot[index + 3],
                    },
                });
            }

            currentStroke.points.push({ x: p.x, y: p.y, color });
        }

        requestAnimationFrame(loop);
    }

    loop();
}

// ----- Mouse Handling -----
function getMousePos(e: MouseEvent) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: Math.floor((e.clientX - rect.left) * (canvas.width / rect.width)),
        y: Math.floor((e.clientY - rect.top) * (canvas.height / rect.height)),
    };
}

function DrawAtMouse(e: MouseEvent, newStroke: boolean) {
    const { x, y } = getMousePos(e);
    pixelX = x;
    pixelY = y;

    if (newStroke) StartStroke(x, y, GetBrushColor());
}

canvas.addEventListener("mousedown", (e) => {
    mouseDown = true;
    DrawAtMouse(e, true);
});
canvas.addEventListener("mouseup", () => (mouseDown = false));
canvas.addEventListener("mouseleave", () => (mouseDown = false));
canvas.addEventListener("mousemove", (e) => {
    if (mouseDown) DrawAtMouse(e, false);
});

// ----- Undo -----
function Undo() {
    if (strokes.length === 0) return;

    const strokeToUndo = strokes.pop()!;
    for (const p of strokeToUndo.pointsBelow) {
        SetPixel(p.x, p.y, p.color);
    }

    ctx.putImageData(img, 0, 0);
}

window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        Undo();
    }
});

undoButton?.addEventListener("click", Undo);

// ----- Canvas Update -----
function updateLoop() {
    if (needsUpdate) {
        ctx.putImageData(img, 0, 0);
        needsUpdate = false;
    }

    brushColor = brushColorInput.value;
    requestAnimationFrame(updateLoop);
}

// ----- Reset -----
function Reset() {
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    data = img.data;
    needsUpdate = true;
}

(window as any).Reset = Reset;

// ----- Initialize -----
window.onload = () => {
    Reset();
    updateLoop();
};
