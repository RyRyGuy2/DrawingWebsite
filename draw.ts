

type rgba = { r: number; g: number; b: number; a: number };
type point = { x: number; y: number; color: rgba };


// ----- DOM Elements -----
const canvas = document.getElementById("canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const brushSizeInput = document.getElementById("brushSize") as HTMLInputElement;
const brushColorInput = document.getElementById("brushColor") as HTMLInputElement;
const undoButton = document.getElementById("undoButton") as HTMLButtonElement;
const toolDisplay = document.getElementById("ToolDisplay");
const brushSizeText = document.getElementById("brushSizeText");

const fileUpload = document.getElementById("fileUpload");
const recenterButton = document.getElementById("button");


// ----- State -----
let brushColor = brushColorInput.value;
let mouseDown = false;
let needsUpdate = false;
let img: ImageData;
let data: Uint8ClampedArray;
let pixelX = 0;
let pixelY = 0;

// Tools
enum SelectedTool {
    Brush = "Brush",
    PaintBucket = "Fill",
    Line = "Line",
    Circle = "Circle",
    Box = "Box"
}
let selectedTool: SelectedTool = SelectedTool.Brush;

// ----- Undo -----
type Stroke = { snapshot: Uint8ClampedArray };
let strokes: Stroke[] = [];
let currentStroke: Stroke | null = null;

// ----- Utilities -----

function imageFileToUint8ClampedArray(
  file: File
): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) return reject("Canvas not supported");

      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      resolve({
        data: imageData.data, // Uint8ClampedArray
        width: canvas.width,
        height: canvas.height,
      });
    };

    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

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

function GetPixelColor(x: number, y: number): rgba {
    const index = (y * canvas.width + x) * 4;
    return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };
}

function SetPixel(x: number, y: number, color: rgba) {
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height) return;
    const index = (y * canvas.width + x) * 4;
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = color.a;
    needsUpdate = true;
}

// ----- Brush -----
function GetBrushMask(size: number) {
    const mask: { dx: number; dy: number }[] = [];
    const rSquared = size * size;
    for (let dx = -size; dx <= size; dx++) {
        for (let dy = -size; dy <= size; dy++) {
            if (dx * dx + dy * dy <= rSquared) mask.push({ dx, dy });
        }
    }
    return mask;
}

function DrawBrush(x: number, y: number, color: rgba) {
    const size = Number(brushSizeInput.value) || 5;
    const mask = GetBrushMask(size);
    for (const { dx, dy } of mask) SetPixel(x + dx, y + dy, color);
}

let previousPoint: point | null = null;
let currentPoint: point | null = null;

function StartStroke(x: number, y: number, color: rgba) {
    currentStroke = { snapshot: new Uint8ClampedArray(data) };
    function loop() {
        if (!mouseDown) {
            strokes.push(currentStroke!);
            currentStroke = null;
            previousPoint = null;
            currentPoint = null;
            return;
        }
        if (previousPoint == null) {
            previousPoint = {x: pixelX, y: pixelY, color: color}
        }
        currentPoint = {x: pixelX, y: pixelY, color: color}

        DrawBrush(pixelX, pixelY, color);
        PointsToInterpolate(currentPoint, previousPoint, color); // ensures a smooth line
        
        previousPoint = {x: pixelX, y: pixelY, color: color}
        requestAnimationFrame(loop);

    }
    loop();
}

function PointsToInterpolate(p1: vector2 | null, p2: vector2 | null, color: rgba) {

    if (p1 === null || p2 === null) return;
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    let dst = Math.sqrt(dx*dx + dy*dy);

    // Avoid div0
    if (dst < 1) return;

    let normalizedx = dx / dst;
    let normalizedy = dy / dst;

    for (let i = 0; i < dst; i++) {
        let x = p1.x + normalizedx * i;
        let y = p1.y + normalizedy * i;
        DrawBrush(Math.round(x), Math.round(y), color);
    }
}
type vector2 = {
    x: number,
    y: number
}
let linePoint1: vector2 | null;
let linePoint2: vector2 | null;
let snapshot: Uint8ClampedArray | null;
let mouseEvent: MouseEvent | null;

let previousMousePos: vector2 | null;
let mousePos: vector2 | null;

function Line() {
    if (mouseEvent != null) mousePos = getMousePos(mouseEvent!);
    previousMousePos = mousePos;
    currentStroke = { snapshot: new Uint8ClampedArray(data)};
    snapshot = new Uint8ClampedArray(data);

    function loop() {
        mousePos = getMousePos(mouseEvent!);

        if (previousMousePos != mousePos) {
            data.set(snapshot!)
            PointsToInterpolate(linePoint1, {x: mousePos!.x, y: mousePos!.y}, GetBrushColor()); // temp line
        }

        if (linePoint2 != null) {
            
            PointsToInterpolate(linePoint1, linePoint2, GetBrushColor());
            strokes.push(currentStroke!);
            currentStroke = null;
            linePoint1 = null;
            linePoint2 = null;


        } else {
            requestAnimationFrame(loop);
        }
    }
    loop();
}

// ----- Flood Fill (Paint Bucket) -----
function Fill(newColor: rgba, e: MouseEvent) {
    const pos = getMousePos(e);
    const x = pos.x;
    const y = pos.y;

    const ogColor = GetPixelColor(x, y);

    currentStroke = { snapshot: new Uint8ClampedArray(data) };
    strokes.push(currentStroke);

    if (
        ogColor.r === newColor.r &&
        ogColor.g === newColor.g &&
        ogColor.b === newColor.b &&
        ogColor.a === newColor.a
    ) return;

    const stack: point[] = [];
    stack.push({ x, y, color: ogColor });

    while (stack.length > 0) {
        const p = stack.pop()!;
        const px = p.x;
        const py = p.y;
        const curColor = GetPixelColor(px, py);

        // Fill if it's white OR original color
        const isWhite =
            curColor.r === 255 &&
            curColor.g === 255 &&
            curColor.b === 255 &&
            curColor.a === 255;

        const isOriginal =
            curColor.r === ogColor.r &&
            curColor.g === ogColor.g &&
            curColor.b === ogColor.b &&
            curColor.a === ogColor.a;

        if (!isWhite && !isOriginal) continue;
        if (
            curColor.r === newColor.r &&
            curColor.g === newColor.g &&
            curColor.b === newColor.b &&
            curColor.a === newColor.a
        ) continue;

        SetPixel(px, py, newColor);

        const neighbors = MakePixelAndScan(px, py);
        for (const n of neighbors) {
            if (!n) continue;
            if (n.x < 0 || n.x >= canvas.width || n.y < 0 || n.y >= canvas.height) continue;
            const neighColor = n.color;
            const neighIsWhite =
                neighColor.r === 255 &&
                neighColor.g === 255 &&
                neighColor.b === 255 &&
                neighColor.a === 255;
            const neighIsOriginal =
                neighColor.r === ogColor.r &&
                neighColor.g === ogColor.g &&
                neighColor.b === ogColor.b &&
                neighColor.a === ogColor.a;
            if (neighIsWhite || neighIsOriginal) stack.push(n);
        }
    }

    currentStroke = null;
}
// ----- Neighbor scanning -----
function MakePixelAndScan(x: number, y: number): point[] {
    const points: point[] = [];
    const neighbors = [
        { x: x - 1, y: y }, // left
        { x: x + 1, y: y }, // right
        { x: x, y: y - 1 }, // up
        { x: x, y: y + 1 }, // down
    ];
    for (const n of neighbors) {
        if (n.x < 0 || n.x >= canvas.width) continue;
        if (n.y < 0 || n.y >= canvas.height) continue;
        points.push({ x: n.x, y: n.y, color: GetPixelColor(n.x, n.y) });
    }
    return points;
}
// ----- Mouse -----
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
function SetSelectedTool(tool: SelectedTool) {
    selectedTool = tool;
    if (toolDisplay) toolDisplay.textContent = "Selected tool:" + tool;
}
function DegreesToRad(degrees: number): number {
    return degrees * (Math.PI / 180);
}

let circlePoint1: vector2 | null;
let circlePoint2: vector2 | null;
//let snapshot: Uint8ClampedArray | null; reuse this
//let mouseEvent: MouseEvent | null; reuse this

//let previousMousePos: vector2 | null; reuse
//let mousePos: vector2 | null; ruese


function Circle() {
    if (mouseEvent != null) mousePos = getMousePos(mouseEvent!);
    previousMousePos = mousePos;
    currentStroke = { snapshot: new Uint8ClampedArray(data)};
    snapshot = new Uint8ClampedArray(data);

    function loop() {
        mousePos = getMousePos(mouseEvent!);

        if (previousMousePos != mousePos) {
            data.set(snapshot!)
            DrawCircle(circlePoint1!, {x: mousePos!.x, y: mousePos!.y}, 45); // temp line
        }

        if (circlePoint1 != null && circlePoint2 != null) {
           
            DrawCircle(circlePoint1, circlePoint2, 180);
            strokes.push(currentStroke!);
            circlePoint1 = null;
            circlePoint2 = null;
            


        } else {
            requestAnimationFrame(loop);
        }
    }
    loop();
}

function DrawCircle(p1: vector2, p2: vector2, quality: number = 90) {
    let dx = p2.x - p1.x;
            let dy = p2.y - p1.y;
            let dst = Math.sqrt(dx*dx + dy*dy);
            let circPoints: vector2[] | null = [];

            // loop through 90 degrees of circle
            for (let i = 0; i < quality; i++) {
                let divisor = quality/90;
                let rad = DegreesToRad(i/divisor);
                let vector: vector2 = {x: p1.x + Math.cos(rad) * dst, y: p1.y +  Math.sin(rad) * dst}
                circPoints.push(vector);
            }

            let allPoints: vector2[] = [];

            for (const point of circPoints) {
                allPoints.push(point); // original point
                allPoints.push({ x: p1.x - (point.x - p1.x), y: point.y });  // mirror left
                allPoints.push({ x: p1.x - (point.x - p1.x), y: p1.y - (point.y - p1.y) }); // mirror bottom-left
                allPoints.push({ x: point.x, y: p1.y - (point.y - p1.y) });  // mirror bottom-right

            }

            for (let i = 0; i < allPoints.length; i++) {
                const point = allPoints[i];
                DrawBrush(Math.round(point.x), Math.round(point.y), GetBrushColor());
            }
            circPoints = null;
}


// ----- Event Listeners -----
canvas.addEventListener("mousedown", (e) => {
    mouseDown = true;
    if (selectedTool === SelectedTool.Brush) {
        DrawAtMouse(e, true);
    } else if (selectedTool === SelectedTool.PaintBucket) {
        Fill(GetBrushColor(), e);
    } else if (selectedTool === SelectedTool.Line) {
        mouseEvent = e;
        linePoint1 = {
            x: getMousePos(e).x,
            y: getMousePos(e).y
        }
        Line();  
    } else if (selectedTool === SelectedTool.Circle) {
        mouseEvent = e;
        circlePoint1 = getMousePos(e);
        Circle();
    }
    
    toolDisplay!.textContent = selectedTool;
});
canvas.addEventListener("mouseup", (e) => {
    mouseDown = false;
    
    if (selectedTool === SelectedTool.Line) {
        linePoint2 = {
            x: getMousePos(e).x,
            y: getMousePos(e).y
        }
        mouseEvent = e;
    }
    if (selectedTool === SelectedTool.Circle) {
        circlePoint2 = {
            x: getMousePos(e).x,
            y: getMousePos(e).y
        }
        mouseEvent = e;
    }
}); 
canvas.addEventListener("mouseleave", () => (mouseDown = false));
canvas.addEventListener("mousemove", (e) => {
    if (mouseDown && selectedTool === SelectedTool.Brush) DrawAtMouse(e, false);
    if (selectedTool === SelectedTool.Line) mouseEvent = e;
    if (selectedTool === SelectedTool.Circle) mouseEvent = e;
});

window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "f") SetSelectedTool(SelectedTool.PaintBucket);
    if (e.key.toLowerCase() === "b") SetSelectedTool(SelectedTool.Brush);
    if (e.key.toLowerCase() === "l") SetSelectedTool(SelectedTool.Line);
    if (e.key.toLowerCase() === "c") SetSelectedTool(SelectedTool.Circle);
    if (e.key.toLowerCase)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") Undo();
});

undoButton?.addEventListener("click", Undo);

// ----- Undo -----
function Undo() {
    if (strokes.length === 0) return;

    const strokeToUndo = strokes.pop()!;
    data.set(strokeToUndo.snapshot);
    needsUpdate = true;

    // --- FIX: Reset line tool state ---
    linePoint1 = null;
    linePoint2 = null;
    snapshot = null;
    mouseEvent = null;
    previousMousePos = null;
    currentStroke = null;
}

// ----- Canvas Update -----
function UpdateLoop() {
    if (needsUpdate) {
        ctx.putImageData(img, 0, 0);
        needsUpdate = false;
    }
    brushSizeText!.textContent = "Brush Size : " + brushSizeInput.value;
    brushColor = brushColorInput.value;
    requestAnimationFrame(UpdateLoop);
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
    UpdateLoop();
    SetSelectedTool(SelectedTool.Brush);
    
};