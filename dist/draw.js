"use strict";
// ----- DOM Elements -----
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const brushSizeInput = document.getElementById("brushSize");
const brushColorInput = document.getElementById("brushColor");
const undoButton = document.getElementById("undoButton");
const toolDisplay = document.getElementById("ToolDisplay");
const brushSizeText = document.getElementById("brushSizeText");
// ----- State -----
let brushColor = brushColorInput.value;
let mouseDown = false;
let needsUpdate = false;
let img;
let data;
let pixelX = 0;
let pixelY = 0;
// Tools
var SelectedTool;
(function (SelectedTool) {
    SelectedTool["Brush"] = "Brush";
    SelectedTool["PaintBucket"] = "Fill";
    SelectedTool["Line"] = "Line";
})(SelectedTool || (SelectedTool = {}));
let selectedTool = SelectedTool.Brush;
let strokes = [];
let currentStroke = null;
// ----- Utilities -----
function HexToRgba(hex, alpha = 255) {
    hex = hex.replace(/^#/, "");
    if (hex.length === 3)
        hex = hex.split("").map(c => c + c).join("");
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return { r, g, b, a: alpha };
}
function GetBrushColor() {
    return HexToRgba(brushColor, 255);
}
function GetPixelColor(x, y) {
    const index = (y * canvas.width + x) * 4;
    return { r: data[index], g: data[index + 1], b: data[index + 2], a: data[index + 3] };
}
function SetPixel(x, y, color) {
    if (x < 0 || x >= canvas.width || y < 0 || y >= canvas.height)
        return;
    const index = (y * canvas.width + x) * 4;
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = color.a;
    needsUpdate = true;
}
// ----- Brush -----
function GetBrushMask(size) {
    const mask = [];
    const rSquared = size * size;
    for (let dx = -size; dx <= size; dx++) {
        for (let dy = -size; dy <= size; dy++) {
            if (dx * dx + dy * dy <= rSquared)
                mask.push({ dx, dy });
        }
    }
    return mask;
}
function DrawBrush(x, y, color) {
    const size = Number(brushSizeInput.value) || 5;
    const mask = GetBrushMask(size);
    for (const { dx, dy } of mask)
        SetPixel(x + dx, y + dy, color);
}
let previousPoint = null;
let currentPoint = null;
function StartStroke(x, y, color) {
    currentStroke = { snapshot: new Uint8ClampedArray(data) };
    function loop() {
        if (!mouseDown) {
            strokes.push(currentStroke);
            currentStroke = null;
            previousPoint = null;
            currentPoint = null;
            return;
        }
        if (previousPoint == null) {
            previousPoint = { x: pixelX, y: pixelY, color: color };
        }
        currentPoint = { x: pixelX, y: pixelY, color: color };
        DrawBrush(pixelX, pixelY, color);
        PointsToInterpolate(currentPoint, previousPoint, color); // ensures a smooth line
        previousPoint = { x: pixelX, y: pixelY, color: color };
        requestAnimationFrame(loop);
    }
    loop();
}
function PointsToInterpolate(p1, p2, color) {
    if (p1 === null || p2 === null)
        return;
    let dx = p2.x - p1.x;
    let dy = p2.y - p1.y;
    let dst = Math.sqrt(dx * dx + dy * dy);
    // Avoid div0
    if (dst < 1)
        return;
    let normalizedx = dx / dst;
    let normalizedy = dy / dst;
    for (let i = 0; i < dst; i++) {
        let x = p1.x + normalizedx * i;
        let y = p1.y + normalizedy * i;
        DrawBrush(Math.round(x), Math.round(y), color);
    }
}
let linePoint1;
let linePoint2;
let snapshot;
let mouseEvent;
let previousMousePos;
let mousePos;
function Line() {
    if (mouseEvent != null)
        mousePos = getMousePos(mouseEvent);
    previousMousePos = mousePos;
    currentStroke = { snapshot: new Uint8ClampedArray(data) };
    snapshot = new Uint8ClampedArray(data);
    function loop() {
        mousePos = getMousePos(mouseEvent);
        if (previousMousePos != mousePos) {
            data.set(snapshot);
            PointsToInterpolate(linePoint1, { x: mousePos.x, y: mousePos.y, color: GetBrushColor() }, GetBrushColor()); // temp line
        }
        if (linePoint2 != null) {
            PointsToInterpolate(linePoint1, linePoint2, GetBrushColor());
            strokes.push(currentStroke);
            currentStroke = null;
            linePoint1 = null;
            linePoint2 = null;
        }
        else {
            requestAnimationFrame(loop);
        }
    }
    loop();
}
// ----- Flood Fill (Paint Bucket) -----
function Fill(newColor, e) {
    const pos = getMousePos(e);
    const x = pos.x;
    const y = pos.y;
    const ogColor = GetPixelColor(x, y);
    currentStroke = { snapshot: new Uint8ClampedArray(data) };
    strokes.push(currentStroke);
    if (ogColor.r === newColor.r &&
        ogColor.g === newColor.g &&
        ogColor.b === newColor.b &&
        ogColor.a === newColor.a)
        return;
    const stack = [];
    stack.push({ x, y, color: ogColor });
    while (stack.length > 0) {
        const p = stack.pop();
        const px = p.x;
        const py = p.y;
        const curColor = GetPixelColor(px, py);
        // Fill if it's white OR original color
        const isWhite = curColor.r === 255 &&
            curColor.g === 255 &&
            curColor.b === 255 &&
            curColor.a === 255;
        const isOriginal = curColor.r === ogColor.r &&
            curColor.g === ogColor.g &&
            curColor.b === ogColor.b &&
            curColor.a === ogColor.a;
        if (!isWhite && !isOriginal)
            continue;
        if (curColor.r === newColor.r &&
            curColor.g === newColor.g &&
            curColor.b === newColor.b &&
            curColor.a === newColor.a)
            continue;
        SetPixel(px, py, newColor);
        const neighbors = MakePixelAndScan(px, py);
        for (const n of neighbors) {
            if (!n)
                continue;
            if (n.x < 0 || n.x >= canvas.width || n.y < 0 || n.y >= canvas.height)
                continue;
            const neighColor = n.color;
            const neighIsWhite = neighColor.r === 255 &&
                neighColor.g === 255 &&
                neighColor.b === 255 &&
                neighColor.a === 255;
            const neighIsOriginal = neighColor.r === ogColor.r &&
                neighColor.g === ogColor.g &&
                neighColor.b === ogColor.b &&
                neighColor.a === ogColor.a;
            if (neighIsWhite || neighIsOriginal)
                stack.push(n);
        }
    }
    // Save stroke for undo
    strokes.push({ snapshot: new Uint8ClampedArray(data) });
    currentStroke = null;
}
// ----- Neighbor scanning -----
function MakePixelAndScan(x, y) {
    const points = [];
    const neighbors = [
        { x: x - 1, y: y }, // left
        { x: x + 1, y: y }, // right
        { x: x, y: y - 1 }, // up
        { x: x, y: y + 1 }, // down
    ];
    for (const n of neighbors) {
        if (n.x < 0 || n.x >= canvas.width)
            continue;
        if (n.y < 0 || n.y >= canvas.height)
            continue;
        points.push({ x: n.x, y: n.y, color: GetPixelColor(n.x, n.y) });
    }
    return points;
}
// ----- Mouse -----
function getMousePos(e) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: Math.floor((e.clientX - rect.left) * (canvas.width / rect.width)),
        y: Math.floor((e.clientY - rect.top) * (canvas.height / rect.height)),
    };
}
function DrawAtMouse(e, newStroke) {
    const { x, y } = getMousePos(e);
    pixelX = x;
    pixelY = y;
    if (newStroke)
        StartStroke(x, y, GetBrushColor());
}
function SetSelectedTool(tool) {
    selectedTool = tool;
    if (toolDisplay)
        toolDisplay.textContent = "Selected tool:" + tool;
}
// ----- Event Listeners -----
canvas.addEventListener("mousedown", (e) => {
    mouseDown = true;
    if (selectedTool === SelectedTool.Brush) {
        DrawAtMouse(e, true);
    }
    else if (selectedTool === SelectedTool.PaintBucket) {
        Fill(GetBrushColor(), e);
    }
    else if (selectedTool === SelectedTool.Line) {
        mouseEvent = e;
        linePoint1 = {
            x: getMousePos(e).x,
            y: getMousePos(e).y,
            color: GetBrushColor()
        };
        Line();
    }
    toolDisplay.textContent = selectedTool;
});
canvas.addEventListener("mouseup", (e) => {
    mouseDown = false;
    if (selectedTool === SelectedTool.Line) {
        linePoint2 = {
            x: getMousePos(e).x,
            y: getMousePos(e).y,
            color: GetBrushColor()
        };
        mouseEvent = e;
    }
});
canvas.addEventListener("mouseleave", () => (mouseDown = false));
canvas.addEventListener("mousemove", (e) => {
    if (mouseDown && selectedTool === SelectedTool.Brush)
        DrawAtMouse(e, false);
    if (selectedTool === SelectedTool.Line)
        mouseEvent = e;
});
window.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "f")
        SetSelectedTool(SelectedTool.PaintBucket);
    if (e.key.toLowerCase() === "b")
        SetSelectedTool(SelectedTool.Brush);
    if (e.key.toLowerCase() === "l")
        SetSelectedTool(SelectedTool.Line);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z")
        Undo();
});
undoButton === null || undoButton === void 0 ? void 0 : undoButton.addEventListener("click", Undo);
// ----- Undo -----
function Undo() {
    if (strokes.length === 0)
        return;
    const strokeToUndo = strokes.pop();
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
    brushSizeText.textContent = "Brush Size : " + brushSizeInput.value;
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
window.Reset = Reset;
// ----- Initialize -----
window.onload = () => {
    Reset();
    UpdateLoop();
    SetSelectedTool(SelectedTool.Brush);
};
