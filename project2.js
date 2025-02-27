const VSHADER_SOURCE = `
    attribute vec3 a_Position;
    uniform mat4 u_Model;
    uniform mat4 u_Camera;
    uniform mat4 u_Projection;
    attribute vec3 a_Color;
    varying vec3 v_Color;
    void main() {
        gl_Position = u_Projection * u_Camera * u_Model * vec4(a_Position, 1.0);
        v_Color = a_Color;
    }
`

const FSHADER_SOURCE = `
    varying mediump vec3 v_Color;
    void main() {
        gl_FragColor = vec4(v_Color, 1.0);
    }
`

function setupVec3(name, stride, offset) {
    const attributeID = gl.getAttribLocation(gl.program, `${name}`);
    if (attributeID < 0) {
        console.log(`Failed to get the storage location of ${name}`);
        return false;
    }
    gl.vertexAttribPointer(attributeID, 3, gl.FLOAT, false, stride, offset);
    gl.enableVertexAttribArray(attributeID);
    return true;
}

function calculateCamera() {
    if (g_isDetached) {
        return new Matrix4().setFromQuat(
            g_cameraRot.x, g_cameraRot.y, g_cameraRot.z, g_cameraRot.w
        ).translate(...g_cameraPos.map(v => -v));
    }

    const cameraX = Math.cos(Math.PI * g_cameraAngle / 180);
    const cameraY = g_cameraHeight;
    const cameraZ = Math.sin(Math.PI * g_cameraAngle / 180);
    const cameraPositionArray = [
        cameraX * g_cameraDistance,
        cameraY * g_cameraDistance + g_lastHeight,
        cameraZ * g_cameraDistance
    ];
    return new Matrix4().setLookAt(...cameraPositionArray, 0, g_lastHeight, 0, 0, 1, 0);
}

const FLOAT_SIZE = 4
function draw() {
    gl.uniformMatrix4fv(g_u_cameraRef, false, calculateCamera().elements);
    gl.uniformMatrix4fv(g_u_projectionRef, false, new Matrix4().setPerspective(90, 1.6, 0.1, 10000).elements);

    gl.clearColor(0.0, 0.75, 1.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO1);
    if (!setupVec3('a_Position', 0, 0)) {
        return;
    }
    if (!setupVec3('a_Color', 0, (g_i400BodyMesh.length + g_i400HatchMesh.length + g_i400PropMesh.length + g_planeMesh.length +
        g_uboatMesh.length + g_torpMesh.length + g_explMesh.length + g_seaMesh.length) * FLOAT_SIZE)) {
        return -1;
    }

    let first = 0, count = g_i400BodyMesh.length / 3;
    gl.uniformMatrix4fv(g_u_modelRef, false, g_i400Matrix.elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    first += count;
    count = g_i400HatchMesh.length / 3;
    gl.drawArrays(gl.TRIANGLES, first, count);

    first += count;
    count = g_i400PropMesh.length / 3;
    gl.uniformMatrix4fv(g_u_modelRef, false, new Matrix4(g_i400Matrix).concat(g_leftPropMatrix).elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    gl.uniformMatrix4fv(g_u_modelRef, false, new Matrix4(g_i400Matrix).concat(g_rightPropMatrix).elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    first += count;
    count = g_planeMesh.length / 3;
    gl.uniformMatrix4fv(g_u_modelRef, false, g_planeMatrix.elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    first += count;
    count = g_uboatMesh.length / 3;
    if (g_planeLaunched && g_explScale < 50) {
        gl.uniformMatrix4fv(g_u_modelRef, false, new Matrix4().setTranslate(0, 0, -ISLAND_DIST).concat(g_uboatMatrix).elements);
        gl.drawArrays(gl.TRIANGLES, first, count);
    }

    first += count;
    count = g_torpMesh.length / 3;
    if (g_torpFired && !g_hit) {
        gl.uniformMatrix4fv(g_u_modelRef, false, g_torpMatrix.elements);
        gl.drawArrays(gl.TRIANGLES, first, count);
    }

    first += count;
    count = g_explMesh.length / 3;
    if (g_hit) {
        gl.uniformMatrix4fv(g_u_modelRef, false, new Matrix4(g_explMatrix).scale(g_explScale, g_explScale, g_explScale).elements);
        gl.drawArrays(gl.TRIANGLES, first, count);
    }

    first += count;
    count = g_seaMesh.length / 3;
    gl.uniformMatrix4fv(g_u_modelRef, false, new Matrix4().setTranslate(0, 0, g_seaDist).concat(g_seaMatrix).elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO2);
    if (!setupVec3('a_Position', 0, 0)) {
        return;
    }
    if (!setupVec3('a_Color', 0, g_islandMesh.length * FLOAT_SIZE)) {
        return -1;
    }

    gl.uniformMatrix4fv(g_u_modelRef, false, new Matrix4().setTranslate(0, 0, -ISLAND_DIST).concat(g_islandMatrix).elements);
    gl.drawArrays(gl.TRIANGLES, 0, g_islandMesh.length / 3);
}

function lerp(a, b, t) {
    return (1 - t) * a + t * b;
}

let g_isDetached = false;
let g_cameraPos = [0, 30, 100];
let g_cameraAxisX = new Vector3([1, 0, 0]);
let g_cameraAxisY = new Vector3([0, 1, 0]);
let g_cameraAxisZ = new Vector3([0, 0, 1]);
let g_cameraRot = new Quaternion();
const CAMERA_SPEED = 1;
const CAMERA_SPEED_ROT = 0.5;
const CAMERA_SPEED_DIST = 0.1;
const CAMERA_SPEED_ANGLE = 0.1;
const CAMERA_SPEED_HEIGHT = 0.0025;
let g_cameraDistance = 100;
let g_cameraAngle = 90;
let g_cameraHeight = 0.25;
function updateCamera(deltaTime) {
    const axisX = g_cameraAxisX.elements;
    const axisY = g_cameraAxisY.elements;
    const axisZ = g_cameraAxisZ.elements;
    const inputWS = g_movingForward - g_movingBackward;
    const inputAD = g_movingLeft - g_movingRight;
    const inputQE = g_rollingLeft - g_rollingRight;
    const inputRF = g_movingUp - g_movingDown;

    if (g_isDetached) {
        let rotation = new Quaternion();
        g_cameraPos = [
            g_cameraPos[0] - axisZ[0] * CAMERA_SPEED * inputWS,
            g_cameraPos[1] - axisZ[1] * CAMERA_SPEED * inputWS,
            g_cameraPos[2] - axisZ[2] * CAMERA_SPEED * inputWS
        ];
        rotation.multiplySelf(new Quaternion().setFromAxisAngle(...axisY.elements, -CAMERA_SPEED_ROT * inputAD));
        rotation.multiplySelf(new Quaternion().setFromAxisAngle(...axisX.elements, -CAMERA_SPEED_ROT * inputRF));
        rotation.multiplySelf(new Quaternion().setFromAxisAngle(...axisZ.elements, -CAMERA_SPEED_ROT * inputQE));
        g_cameraRot.multiplySelf(rotation);
        rotation.inverse();
        rotation.multiplyVector3(g_cameraAxisX);
        rotation.multiplyVector3(g_cameraAxisY);
        rotation.multiplyVector3(g_cameraAxisZ);
    } else {
        g_cameraDistance -= CAMERA_SPEED_DIST * deltaTime * inputWS;
        g_cameraDistance = Math.max(g_cameraDistance, 10);
        g_cameraAngle += CAMERA_SPEED_ANGLE * deltaTime * inputAD;
        g_cameraHeight += CAMERA_SPEED_HEIGHT * deltaTime * inputRF;
    }
}

const ROTATION_SPEED = 1;
let g_uboatAngle = 0;
const PLANE_SPEED = 0.15;
const TORP_SPEED = 0.05;
// const SEA_SPEED = 0.002;
const SEA_SPEED = 0.01;
let g_planeLaunched = true;
let g_planeDist = 0;
let g_torpFired = false;
let g_torpDist = 50;
let g_hit = false;
let g_explScale = 0;
let g_seaDist = 0;
let g_lastRoll = 0;
let g_lastHeight = 0;
let g_lastPitch = 0;
function tick() {
    const currentTime = Date.now();
    const deltaTime = currentTime - g_lastFrameMS;
    g_lastFrameMS = currentTime;

    updateCamera(deltaTime);

    const angle = -ROTATION_SPEED * deltaTime;
    g_leftPropMatrix.rotate(angle, 0, 0, 1);
    g_rightPropMatrix.rotate(angle, 0, 0, 1);
    g_uboatAngle += angle / 50;
    if (g_uboatAngle < -360) {
        g_uboatAngle += 360;
    }
    g_uboatMatrix = new Matrix4().setRotate(angle / 50, 0, 1, 0).concat(g_uboatMatrix);

    let speed = PLANE_SPEED * deltaTime;
    if (g_planeLaunched) {
        g_planeMatrix.translate(0, speed * Math.tan(0.2), -speed);
    }

    speed = TORP_SPEED * deltaTime;
    if (g_torpFired) {
        g_torpDist += speed;
        if (g_torpDist > ISLAND_DIST - g_islandRadius - 1 &&
            g_torpDist < ISLAND_DIST - g_islandRadius + 1 &&
            g_uboatAngle > -200 && g_uboatAngle < -160) {
            g_hit = true;
        }
        g_torpMatrix = new Matrix4().setTranslate(0, 0, -speed).concat(g_torpMatrix).rotate(angle / 2, 0, 0, 1);
    }

    if (g_hit && g_explScale < 150) {
        g_explScale += deltaTime;
    }
    if (g_explScale >= 150) {
        g_explMatrix.setScale(0, 0, 0);
    }

    g_seaDist += SEA_SPEED * deltaTime;
    if (g_seaDist > 1000) {
        g_seaDist -= 1000;
    }
    const index = Math.round(g_sea.length / 2 + 900 - g_seaDist / 2500 * 3000);

    let avgSideHeight = 0;
    for (let i = index - 30; i < index + 30; i++) {
        avgSideHeight += (g_sea[i + 3000][1] - g_sea[i - 3000][1]) * 3;
    }
    avgSideHeight /= 60;
    const roll = Math.atan2(avgSideHeight, 2 * 5) * 180 / Math.PI;
    const newRoll = lerp(g_lastRoll, roll, 0.005);

    let avgHeight = 0;
    for (let i = index - 30; i < index + 30; i++) {
        if (g_sea[i][1] < 0) {
            avgHeight += g_sea[i][1] * 3;
        } else {
            avgHeight += g_sea[i][1] * 5;
        }
    }
    avgHeight /= 60;
    const newHeight = lerp(g_lastHeight, avgHeight, 0.1);
    const pitch = Math.atan2(newHeight - g_lastHeight, SEA_SPEED * deltaTime) * 180 / Math.PI;
    const newPitch = lerp(g_lastPitch, pitch, 0.005);

    g_i400Matrix.setTranslate(0, newHeight, 0).rotate(newPitch, 1, 0, 0).rotate(newRoll, 0, 0, 1);
    g_lastRoll = newRoll;
    g_lastHeight = newHeight;
    g_lastPitch = newPitch;

    draw();
    requestAnimationFrame(tick, g_canvas);
}

let g_planeMatrix = new Matrix4();
let g_uboatMatrix = new Matrix4();
let g_torpMatrix = new Matrix4();
let g_explMatrix = new Matrix4();
let g_islandMatrix = new Matrix4();
function resetMatrices() {
    g_planeMatrix.setIdentity();
    g_uboatMatrix.setTranslate(0, 0, -g_islandRadius).rotate(90, 0, 1, 0).scale(2, 2, 2);
    g_torpMatrix.setTranslate(0, -0.5, -50).scale(5, 5, 5);
    g_explMatrix.setTranslate(0, 0, g_islandRadius - ISLAND_DIST);
    g_islandMatrix.setTranslate(-g_islandRadius, 25, -g_islandRadius).scale(5, 5, 5);
}

function initVBO(data) {
    const VBOloc = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, VBOloc);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return VBOloc;
}

function buildIslandColors(terrain, height) {
    let colors = [];
    const border = height / 4;
    for (let i = 0; i < terrain.length; i++) {
        const overHeight = terrain[i][1] + border;
        if (overHeight < 0) {
            colors.push(1 - i % 3 / 20, 0.95, 0.85);
        } else {
            const shade = overHeight / height / 2;
            colors.push(0.4 - shade, 0.6 - shade, 0);
        }
    }
    return colors;
}

function fixIsland(terrain, size) {
    for (let i = 0; i < terrain.length; i++) {
        const distance = Math.pow(terrain[i][0] - size / 2, 2) + Math.pow(terrain[i][2] - size / 2, 2);
        const overSize = distance - Math.pow(size / 3, 2);
        if (overSize > 0) {
            terrain[i][1] = terrain[i][1] * Math.pow(1.01, -overSize) - overSize / size;
        } else {
            terrain[i][1] -= overSize * Math.pow(size, -1.5);
        }
    }
}

function generateIsland(size) {
    const seed = new Date().getMilliseconds();
    const options = {
        width: size,
        height: 3 + 0.1 * size,
        depth: size,
        seed: seed,
        noisefn: 'perlin', // 'wave', 'simplex' and 'perlin'
        roughness: 5 + 0.05 * size
    };
    const island = g_terrainGenerator.generateTerrainMesh(options);
    fixIsland(island, size);
    g_islandMesh = [];
    for (let i = 0; i < island.length; i++) {
        g_islandMesh.push(...island[i]);
    }
    const islandColors = buildIslandColors(island, options.height);

    VBO2 = initVBO(new Float32Array(g_islandMesh.concat(islandColors)));
}

function buildSeaColors(terrain, height) {
    let colors = []
    for (let i = 0; i < terrain.length; i++) {
        const shade = (terrain[i][1] / height - 0.25) * 3 + 0.25;
        colors.push(shade, shade, 1.0);
    }
    return colors;
}

function buildExplColorAttributes(vertex_count) {
    let colors = [];
    for (let i = 0; i < vertex_count; i++) {
        colors.push(1, 1, 1);
    }
    return colors;
}

function buildColorAttributes(vertex_count) {
    let colors = [];
    for (let i = 0; i < vertex_count / 3; i++) {
        for (let vert = 0; vert < 3; vert++) {
            const shade = i * 3 / vertex_count;
            colors.push(shade, shade, shade);
        }
    }
    return colors;
}

function buildPlaneColorAttributes(vertex_count) {
    let colors = [];
    for (let i = 0; i < vertex_count / 3; i++) {
        for (let vert = 0; vert < 3; vert++) {
            const shade = i * 1.5 / vertex_count;
            colors.push(shade, 0.5, shade);
        }
    }
    return colors;
}

function buildPropColorAttributes(vertex_count) {
    let colors = [];
    for (let i = 0; i < vertex_count / 3; i++) {
        for (let vert = 0; vert < 3; vert++) {
            const shade = i * 1.5 / vertex_count + 0.5;
            colors.push(shade, shade, 0);
        }
    }
    return colors;
}

function buildI400ColorAttributes(vertex_count, mesh) {
    let colors = [];
    for (let i = 0; i < vertex_count / 3; i++) {
        // three vertices per triangle
        for (let vert = 0; vert < 3; vert++) {
            let shade = i * 3 / vertex_count;
            if (shade > 0.75) {
                shade = shade * 4 - 3;
            }
            if (mesh[(i * 3 + vert) * 3 + 1] < -0.5) {
                colors.push(shade, 0, 0);
            } else {
                colors.push(shade, shade, shade);
            }
        }
    }
    return colors;
}

const g_terrainGenerator = new TerrainGenerator();
let g_sea, g_seaMesh = [], g_islandMesh;
let VBO1, VBO2;
let g_islandSize = 50;
let g_islandRadius;
let g_u_modelRef, g_u_cameraRef, g_u_projectionRef;
let g_i400Matrix = new Matrix4();
let g_leftPropMatrix = new Matrix4().setTranslate(-2.2903, -4.7443, 54.25);
let g_rightPropMatrix = new Matrix4().setTranslate(2.2902, -4.7443, 54.25);
let g_seaMatrix = new Matrix4().setScale(5, 5, 5).translate(-100, 0, -400);
const ISLAND_DIST = 500;
function startRendering() {
    if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
        console.log('Failed to intialize shaders.');
        return;
    }

    const i400BodyColors = buildI400ColorAttributes(g_i400BodyMesh.length / 3, g_i400BodyMesh);
    const i400HatchColors = buildColorAttributes(g_i400HatchMesh.length / 3);
    const i400PropColors = buildPropColorAttributes(g_i400PropMesh.length / 3);
    const planeColors = buildPlaneColorAttributes(g_planeMesh.length / 3);
    const uboatColors = buildColorAttributes(g_uboatMesh.length / 3);
    const torpColors = buildColorAttributes(g_torpMesh.length / 3);
    const explColors = buildExplColorAttributes(g_explMesh.length / 3);

    const seed = new Date().getMilliseconds();
    const options = {
        width: 200,
        height: 2,
        depth: 500,
        seed: seed,
        noisefn: 'perlin', // 'wave', 'simplex' and 'perlin'
        roughness: 50
    }
    g_sea = g_terrainGenerator.generateTerrainMesh(options);
    for (let i = 0; i < g_sea.length; i++) {
        g_seaMesh.push(...g_sea[i]);
    }
    const seaColors = buildSeaColors(g_sea, options.height);

    const data = g_i400BodyMesh.concat(g_i400HatchMesh).concat(g_i400PropMesh).concat(g_planeMesh).concat(g_uboatMesh).concat(g_torpMesh).concat(g_explMesh).concat(g_seaMesh).
        concat(i400BodyColors).concat(i400HatchColors).concat(i400PropColors).concat(planeColors).concat(uboatColors).concat(torpColors).concat(explColors).concat(seaColors);
    VBO1 = initVBO(new Float32Array(data));

    generateIsland(g_islandSize);

    g_u_modelRef = gl.getUniformLocation(gl.program, 'u_Model');
    g_u_cameraRef = gl.getUniformLocation(gl.program, 'u_Camera');
    g_u_projectionRef = gl.getUniformLocation(gl.program, 'u_Projection');

    g_islandRadius = g_islandSize * 5 / 2;
    resetMatrices();
    

    gl.enable(gl.CULL_FACE);
    gl.enable(gl.DEPTH_TEST);
}

let g_i400BodyMesh = [];
let g_i400HatchMesh = [];
let g_i400PropMesh = [];
let g_planeMesh = [];
let g_uboatMesh = [];
let g_torpMesh = [];
let g_explMesh = [];
async function loadOBJFiles() {
    const files = [
        { path: './resources/I400Body.obj', mesh: g_i400BodyMesh },
        { path: './resources/I400Hatch.obj', mesh: g_i400HatchMesh },
        { path: './resources/I400Prop.obj', mesh: g_i400PropMesh },
        { path: './resources/Plane.obj', mesh: g_planeMesh },
        { path: './resources/Uboat.obj', mesh: g_uboatMesh },
        { path: './resources/Torpedo.obj', mesh: g_torpMesh },
        { path: './resources/Explosion.obj', mesh: g_explMesh }
    ];

    await Promise.all(files.map(async (file) => {
        const response = await fetch(file.path);
        const data = await response.text();
        return readObjFile(data, file.mesh);
    }));
}

let g_movingUp = false;
let g_movingDown = false;
let g_movingLeft = false;
let g_movingRight = false;
let g_movingForward = false;
let g_movingBackward = false;
let g_rollingLeft = false;
let g_rollingRight = false;
function setupKeyBinds(){
    document.addEventListener('keydown', function (event) {
        const key = event.key.toLowerCase();
        if (key === 'r') {
            g_movingUp = true;
        } else if (key === 'f') {
            g_movingDown = true;
        } else if (key === 'a') {
            g_movingLeft = true;
        } else if (key === 'd') {
            g_movingRight = true;
        } else if (key === 'w') {
            g_movingForward = true;
        } else if (key === 's') {
            g_movingBackward = true;
        } else if (key === 'q') {
            g_rollingLeft = true;
        } else if (key === 'e') {
            g_rollingRight = true;
        }
    })

    document.addEventListener('keyup', function (event) {
        const key = event.key.toLowerCase();
        if (key === 'r') {
            g_movingUp = false;
        } else if (key === 'f') {
            g_movingDown = false;
        } else if (key === 'a') {
            g_movingLeft = false;
        } else if (key === 'd') {
            g_movingRight = false;
        } else if (key === 'w') {
            g_movingForward = false;
        } else if (key === 's') {
            g_movingBackward = false;
        } else if (key === 'q') {
            g_rollingLeft = false;
        } else if (key === 'e') {
            g_rollingRight = false;
        }
    })
}

let g_planeBtn;
let g_torpBtn;
let g_resetBtn;
let g_sizeSld;
let g_canvas, gl, g_lastFrameMS;
async function main() {
    setupKeyBinds();
    g_planeBtn = document.getElementById('plane');
    g_torpBtn = document.getElementById('torpedo');
    g_resetBtn = document.getElementById('reset');
    g_sizeSld = document.getElementById('size');

    g_canvas = document.getElementById('canvas');
    gl = getWebGLContext(g_canvas, true);
    if (!gl) {
        console.log('Failed to get the rendering context for WebGL');
        return;
    }

    await loadOBJFiles();
    startRendering();
    document.getElementById("loading").remove();
    g_lastFrameMS = Date.now();
    tick();
}

function fireTorp() {
    g_torpBtn.disabled = true;
    g_torpFired = true;
}

function reset() {
    g_torpFired = false;
    g_hit = false;
    g_uboatAngle = 0;
    g_torpDist = 50;
    g_explScale = 0;
    resetMatrices();

    g_torpBtn.disabled = false;
}

function toggleDetach() {
    g_isDetached = !g_isDetached;
}

function regenerate() {
    g_islandSize = g_sizeSld.value;
    g_islandRadius = g_islandSize * 5 / 2;
    reset();
    generateIsland(g_islandSize);
}
