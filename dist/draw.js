"use strict";
const canvasHolder = document.getElementById("canvas");
const ctx = canvasHolder.getContext("2d"); // ! ensures ctx is not null
const img = ctx.getImageData(0, 0, canvasHolder.width, canvasHolder.height);
const data = img.data;
let pixels = [];
function setupPixelValues() {
    if (!data)
        return;
    pixels = []; // may have to remove in the future to prevent deleting previous data.
    for (let i = 0; i < data.length; i += 4) {
        pixels.push({
            r: data[i],
            g: data[i + 1],
            b: data[i + 2],
            a: data[i + 3]
        });
    }
}
function getPixelAt(x, y) {
    if (x < 0 || x >= canvasHolder.width || y < 0 || y >= canvasHolder.height) {
        return null;
    }
    const index = y * canvasHolder.width + x; // gets position in pixels array
    return pixels[index];
}
function setPixelColor(rgba, index) {
    if (!data)
        return;
    pixels[index] = {
        r: rgba.r,
        g: rgba.g,
        b: rgba.b,
        a: rgba.a
    };
}
function setPixel(x, y, color) {
    if (!ctx || !data || !img)
        return;
    let index = (y * canvasHolder.width + x) * 4;
    data[index] = color.r;
    data[index + 1] = color.g;
    data[index + 2] = color.b;
    data[index + 3] = color.a;
    ctx.putImageData(img, 0, 0);
}
function UpdateCanvas() {
    if (!ctx || !data || !img)
        return;
    for (let i = 0; i < pixels.length; i++) {
        const j = i * 4;
        data[j] = pixels[i].r;
        data[j + 1] = pixels[i].g;
        data[j + 2] = pixels[i].b;
        data[j + 3] = pixels[i].a;
    }
    ctx.putImageData(img, 0, 0);
}
function Main() {
    setupPixelValues();
    let black = {
        r: 0,
        g: 0,
        b: 0,
        a: 255
    };
    canvasHolder.addEventListener("mousemove", (e) => {
        const rect = canvasHolder.getBoundingClientRect();
        const x = Math.floor(e.clientX - rect.left);
        const y = Math.floor(e.clientY - rect.top);
        setPixel(x, y, black);
    });
    UpdateCanvas();
}
