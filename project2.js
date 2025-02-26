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
        cameraY * g_cameraDistance,
        cameraZ * g_cameraDistance
    ];
    return new Matrix4().setLookAt(...cameraPositionArray, 0, 0, 0, 0, 1, 0);
}

const FLOAT_SIZE = 4
function draw() {
    gl.uniformMatrix4fv(g_u_camera_ref, false, calculateCamera().elements);
    gl.uniformMatrix4fv(g_u_projection_ref, false, new Matrix4().setPerspective(90, 1.6, 0.1, 1000).elements);

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
    gl.uniformMatrix4fv(g_u_model_ref, false, g_i400Matrix.elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    first += count;
    count = g_i400HatchMesh.length / 3;
    gl.drawArrays(gl.TRIANGLES, first, count);

    first += count;
    count = g_i400PropMesh.length / 3;
    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_i400Matrix).concat(g_leftPropMatrix).elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_i400Matrix).concat(g_rightPropMatrix).elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    first += count;
    count = g_planeMesh.length / 3;
    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_i400Matrix).concat(g_planeMatrix).elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    first += count;
    count = g_uboatMesh.length / 3;
    if (g_planeLaunched && g_explScale < 10) {
        gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4().setTranslate(ISLAND_DIST, 0, 0).concat(g_uboatMatrix).elements);
        gl.drawArrays(gl.TRIANGLES, first, count);
    }

    first += count;
    count = g_torpMesh.length / 3;
    if (g_torpFired && !g_hit) {
        gl.uniformMatrix4fv(g_u_model_ref, false, g_torpMatrix.elements);
        gl.drawArrays(gl.TRIANGLES, first, count);
    }

    first += count;
    count = g_explMesh.length / 3;
    if (g_hit) {
        gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_explMatrix).scale(g_explScale, g_explScale, g_explScale).elements);
        gl.drawArrays(gl.TRIANGLES, first, count);
    }

    first += count;
    count = g_seaMesh.length / 3;
    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4().scale(0.25, 0.25, 0.25).translate(-g_distance_sea - 500, -0.125, -g_distance_sea - 500).elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO2);
    if (!setupVec3('a_Position', 0, 0)) {
        return;
    }
    if (!setupVec3('a_Color', 0, g_islandMesh.length * FLOAT_SIZE)) {
        return -1;
    }

    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4().setTranslate(ISLAND_DIST, 0, 0).concat(g_islandMatrix).elements);
    gl.drawArrays(gl.TRIANGLES, 0, g_islandMesh.length / 3);
}

let g_isDetached = false;
let g_cameraPos = [-1.5, 0.5, 0];
let g_cameraAxisX = [1, 0, 0];
let g_cameraAxisY = [0, 1, 0];
let g_cameraAxisZ = [0, 0, 1];
let g_cameraRot = new Quaternion().setFromAxisAngle(0, 1, 0, 90);
const CAMERA_SPEED_DETACH = 0.05;
const CAMERA_SPEED_ROT = 0.5;
const CAMERA_SPEED = .001;
const CAMERA_SPEED_ORBIT = 0.05;
let g_cameraDistance = 1.5
let g_cameraAngle = 90
let g_cameraHeight = .2
function updateCamera(deltaTime) {
    const inputWS = g_movingForward - g_movingBackward
    const inputAD = g_movingLeft - g_movingRight
    const inputQE = g_rollingLeft - g_rollingRight
    const inputRF = g_movingUp - g_movingDown

    if (g_isDetached) {
        let rotation = new Quaternion();
        g_cameraPos = [
            g_cameraPos[0] + g_cameraAxisX[0] * CAMERA_SPEED_DETACH * inputWS,
            g_cameraPos[1] + g_cameraAxisX[1] * CAMERA_SPEED_DETACH * inputWS,
            g_cameraPos[2] + g_cameraAxisX[2] * CAMERA_SPEED_DETACH * inputWS
        ];
        rotation.multiplySelf(new Quaternion().setFromAxisAngle(...g_cameraAxisY, -CAMERA_SPEED_ROT * inputAD));
        rotation.multiplySelf(new Quaternion().setFromAxisAngle(...g_cameraAxisZ, -CAMERA_SPEED_ROT * inputRF));
        rotation.multiplySelf(new Quaternion().setFromAxisAngle(...g_cameraAxisX, CAMERA_SPEED_ROT * inputQE));
        g_cameraRot.multiplySelf(rotation);
        rotation.inverse();
        rotation.multiplyVector3(g_cameraAxisX);
        rotation.multiplyVector3(g_cameraAxisY);
        rotation.multiplyVector3(g_cameraAxisZ);
    } else {
        g_cameraDistance -= CAMERA_SPEED * deltaTime * inputWS;
        g_cameraDistance = Math.max(g_cameraDistance, 0.5);
        g_cameraAngle += CAMERA_SPEED_ORBIT * deltaTime * inputAD;
        g_cameraHeight += CAMERA_SPEED * deltaTime * inputRF;
    }
}

const ROTATION_SPEED = 1;
let g_uboatAngle = 0;
const PLANE_SPEED = 0.125;
const TORP_SPEED = 0.001;
const SEA_SPEED = 0.0005;
let g_planeLaunched = false;
let g_torpFired = false;
let g_torp_dist = 0;
let g_hit = false;
let g_explScale = 0;
let g_distance_sea = 0;
function tick() {
    const current_time = Date.now();
    const deltaTime = current_time - g_lastFrameMS;
    g_lastFrameMS = current_time;

    updateCamera(deltaTime);

    const angle = -ROTATION_SPEED * deltaTime;
    g_leftPropMatrix.rotate(angle, 1, 0, 0);
    g_rightPropMatrix.rotate(angle, 1, 0, 0);
    g_uboatAngle += angle / 50;
    if (g_uboatAngle < -360) {
        g_uboatAngle += 360;
    }
    g_uboatMatrix = new Matrix4().setRotate(angle / 50, 0, 1, 0).concat(g_uboatMatrix);

    let speed = -PLANE_SPEED * deltaTime;
    if (g_planeLaunched) {
        g_planeMatrix.translate(speed, speed * Math.tan(-0.0625), 0);
    }

    speed = TORP_SPEED * deltaTime;
    if (g_torpFired) {
        g_torp_dist += speed;
        if (g_torp_dist > ISLAND_DIST - g_islandSize / 2 - 1 &&
            g_torp_dist < ISLAND_DIST - g_islandSize / 2 - 0.8 &&
            g_uboatAngle > -200 && g_uboatAngle < -160) {
            g_hit = true;
        }
        g_torpMatrix = new Matrix4().setTranslate(speed, 0, 0).concat(g_torpMatrix).rotate(angle / 2, 1, 0, 0);
    }

    if (g_hit && g_explScale < 25) {
        g_explScale += 0.1 * deltaTime;
    }
    if (g_explScale >= 25) {
        g_explMatrix.setScale(0, 0, 0);
    }

    g_distance_sea += SEA_SPEED * deltaTime;

    draw();
    requestAnimationFrame(tick, g_canvas);
}

function initVBO(data) {
    const VBOloc = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, VBOloc);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return VBOloc;
}

function buildIslandColors(terrain, height) {
    let colors = [];
    for (let i = 0; i < terrain.length; i++) {
        const shade = (terrain[i][1] / height + 0.5) / 2;
        colors.push(0.3, shade, 0);
    }
    return colors;
}
function fixIsland(terrain, size) {
    for (let i = 0; i < terrain.length; i++) {
        const distance = Math.pow(terrain[i][0] - size / 2, 2) + Math.pow(terrain[i][2] - size / 2, 2);
        const overSize = distance - Math.pow(size / (3.2 - size / 150), 2);
        if (overSize > 0) {
            terrain[i][1] = terrain[i][1] * Math.pow(1.001, -overSize) - overSize / Math.pow(size, 1.85 - size / 500);
        }
    }
}
function buildSeaColors(terrain, height) {
    let colors = []
    for (let i = 0; i < terrain.length; i++) {
        const shade = (terrain[i][1] / height - 0.25) * 3 + 0.25;
        colors.push(shade, shade, 1.0);
    }
    return colors;
}

let g_seaMesh, g_islandMesh;
function generateIsland(size) {
    size *= 10;
    const seed = new Date().getMilliseconds();
    const options = {
        width: size,
        height: 0.5 + 0.002 * size,
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
let VBO1, VBO2;
let g_islandSize = 5;
let g_u_model_ref, g_u_camera_ref, g_u_projection_ref;
let g_i400Matrix = new Matrix4();
let g_leftPropMatrix = new Matrix4();
let g_rightPropMatrix = new Matrix4();
let g_planeMatrix = new Matrix4();
let g_uboatMatrix = new Matrix4();
let g_torpMatrix = new Matrix4();
let g_explMatrix = new Matrix4();
let g_islandMatrix = new Matrix4();
const ISLAND_DIST = 15;
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
        width: 1000,
        height: 0.25,
        depth: 1000,
        seed: seed,
        noisefn: 'perlin', // 'wave', 'simplex' and 'perlin'
        roughness: 500
    }
    const sea = g_terrainGenerator.generateTerrainMesh(options);
    g_seaMesh = [];
    for (let i = 0; i < sea.length; i++) {
        g_seaMesh.push(...sea[i]);
    }
    const seaColors = buildSeaColors(sea, options.height);

    const data = g_i400BodyMesh.concat(g_i400HatchMesh).concat(g_i400PropMesh).concat(g_planeMesh).concat(g_uboatMesh).concat(g_torpMesh).concat(g_explMesh).concat(g_seaMesh).
        concat(i400BodyColors).concat(i400HatchColors).concat(i400PropColors).concat(planeColors).concat(uboatColors).concat(torpColors).concat(explColors).concat(seaColors);
    VBO1 = initVBO(new Float32Array(data));

    generateIsland(g_islandSize);

    g_u_model_ref = gl.getUniformLocation(gl.program, 'u_Model');
    g_u_camera_ref = gl.getUniformLocation(gl.program, 'u_Camera');
    g_u_projection_ref = gl.getUniformLocation(gl.program, 'u_Projection');

    g_i400Matrix.setRotate(180, 0, 1, 0).scale(0.015625, 0.015625, 0.015625);
    g_leftPropMatrix.setTranslate(54.25, -4.7443, 2.2903);
    g_rightPropMatrix.setTranslate(54.25, -4.7443, -2.2902);
    g_uboatMatrix.setTranslate(g_islandSize / 2, 0, 0).rotate(90, 0, 1, 0).scale(0.03125, 0.03125, 0.03125);
    g_torpMatrix.setTranslate(0.9, -0.04, 0).rotate(180, 0, 1, 0).scale(0.0625, 0.0625, 0.0625);
    g_explMatrix.setTranslate(ISLAND_DIST - g_islandSize / 2, 0, 0).scale(0.1, 0.1, 0.1);
    g_islandMatrix.setTranslate(-g_islandSize / 2, 0.5, -g_islandSize / 2).scale(0.1, 1, 0.1);

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
    g_lastFrameMS = Date.now();
    tick();
}

function launchPlane() {
    g_planeLaunched = true;
    g_planeBtn.disabled = true;
    g_torpBtn.disabled = false;
    g_resetBtn.disabled = false;
}
function fireTorp() {
    g_torpFired = true;
    g_torpBtn.disabled = true;
}
function reset() {
    g_planeLaunched = false;
    g_planeMatrix.setIdentity();
    g_torpFired = false;
    g_torp_dist = 0;
    g_torpMatrix.setTranslate(0.9, -0.04, 0).rotate(180, 0, 1, 0).scale(0.0625, 0.0625, 0.0625);
    g_hit = false;
    g_explScale = 0;
    g_explMatrix.setTranslate(ISLAND_DIST - g_islandSize / 2, 0, 0).scale(0.1, 0.1, 0.1);
    g_planeBtn.disabled = false;
    g_torpBtn.disabled = true;
    g_resetBtn.disabled = true;
}

function toggleDetach() {
    g_isDetached = !g_isDetached;
}

function regenerate() {
    g_islandSize = g_sizeSld.value;
    generateIsland(g_islandSize);
    g_islandMatrix.setTranslate(-g_islandSize / 2, 0.5, -g_islandSize / 2).scale(0.1, 1, 0.1);
    g_uboatMatrix.setTranslate(g_islandSize / 2, 0, 0).rotate(90, 0, 1, 0).scale(0.03125, 0.03125, 0.03125);
    g_explMatrix.setTranslate(ISLAND_DIST - g_islandSize / 2, 0, 0).scale(0.1, 0.1, 0.1);
}
