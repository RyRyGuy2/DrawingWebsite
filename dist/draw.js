"use strict";
const canvasHolder = document.getElementById("canvas");
const ctx = canvasHolder.getContext("2d");
const brushSizeInput = document.getElementById("brushSize");
const img = ctx.getImageData(0, 0, canvasHolder.width, canvasHolder.height);
const data = img.data;
let mouseDown = false;
let needsUpdate = false;
canvasHolder.addEventListener("mousedown", () => mouseDown = true);
canvasHolder.addEventListener("mouseup", () => mouseDown = false);
canvasHolder.addEventListener("mouseleave", () => mouseDown = false);
function setPixel(x, y, color) {
    if (x < 0 || x >= canvasHolder.width || y < 0 || y >= canvasHolder.height)
        return;
    const index = (y * canvasHolder.width + x) * 4;
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = color.a;
    needsUpdate = true; // mark that canvas needs to update
}
function drawBrush(x, y, color) {
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
// mouse drawing
canvasHolder.addEventListener("mousemove", (e) => {
    if (!mouseDown)
        return;
    const rect = canvasHolder.getBoundingClientRect();
    const x = Math.floor(e.clientX - rect.left);
    const y = Math.floor(e.clientY - rect.top);
    drawBrush(x, y, { r: 0, g: 0, b: 0, a: 255 });
});
// Update canvas once per animation frame
function updateLoop() {
    if (needsUpdate) {
        ctx.putImageData(img, 0, 0);
        needsUpdate = false;
    }
    requestAnimationFrame(updateLoop);
}
// clear canvas
function Reset() {
    for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;
        data[i + 1] = 255;
        data[i + 2] = 255;
        data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
}
window.onload = () => {
    Reset();
    updateLoop(); // start the animation loop
};
