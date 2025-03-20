function setupVec(size, name, stride, offset) {
    const attributeID = gl.getAttribLocation(gl.program, `${name}`);
    if (attributeID < 0) {
        console.log(`Failed to get the storage location of ${name}`);
        return false;
    }
    gl.vertexAttribPointer(attributeID, size, gl.FLOAT, false, stride, offset);
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

    let cameraPosition = new Vector3([cameraX, cameraY, cameraZ]);
    cameraPosition.normalize();
    g_cameraPos = [
        cameraPosition.elements[0] * g_cameraDistance,
        cameraPosition.elements[1] * g_cameraDistance,
        cameraPosition.elements[2] * g_cameraDistance
    ];
    return new Matrix4().setLookAt(...g_cameraPos, 0, 0, 0, 0, 1, 0);
}

function draw(deltaTime) {
    const cameraMatrix = calculateCamera();
    const projectionMatrix = new Matrix4().setPerspective(90, 1.6, 0.1, 10000);
    g_simulator.render(deltaTime, projectionMatrix.elements, cameraMatrix.elements, g_cameraPos);

    gl.useProgram(gl.program);
    gl.uniform1i(g_u_texture_ref, 8);
    gl.uniform1i(g_u_skybox_ref, 9);
    gl.uniform3fv(g_u_light_ref, new Float32Array([-1, 1, -2]));

    gl.uniformMatrix4fv(g_u_camera_ref, false, cameraMatrix.elements);
    gl.uniformMatrix4fv(g_u_projection_ref, false, projectionMatrix.elements);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO1);
    if (!setupVec(3, 'a_Position', 0, 0)) {
        return;
    }
    if (!setupVec(3, 'a_Color', 0, g_meshLen * FLOAT_SIZE)) {
        return;
    }
    if (!setupVec(3, 'a_Normal', 0, 2 * g_meshLen * FLOAT_SIZE)) {
        return;
    }
    if (!setupVec(2, 'a_TexCoord', 0, 3 * g_meshLen * FLOAT_SIZE)) {
        return;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    gl.activeTexture(gl.TEXTURE8);
    gl.uniform1i(g_u_flatlighting_ref, false);
    gl.uniform1f(g_u_specpower_ref, 16);
    gl.uniform1f(g_u_specInten_ref, 0.5);

    // i400Body
    gl.bindTexture(gl.TEXTURE_2D, g_i400TexPointer);
    gl.uniformMatrix4fv(g_u_inversetranspose_ref, false, new Matrix4(g_i400Matrix).invert().transpose().elements);

    let first = 0, count = g_i400Body.mesh.length / 3;
    gl.uniformMatrix4fv(g_u_model_ref, false, g_i400Matrix.elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    gl.uniform1f(g_u_specInten_ref, 2);

    // i400Hatch
    first += count;
    count = g_i400Hatch.mesh.length / 3;
    gl.drawArrays(gl.TRIANGLES, first, count);

    // i400Prop
    first += count;
    count = g_i400Prop.mesh.length / 3;
    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_i400Matrix).concat(g_leftPropMatrix).elements);
    gl.uniformMatrix4fv(g_u_inversetranspose_ref, false, new Matrix4(g_i400Matrix).concat(g_leftPropMatrix).invert().transpose().elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_i400Matrix).concat(g_rightPropMatrix).elements);
    gl.uniformMatrix4fv(g_u_inversetranspose_ref, false, new Matrix4(g_i400Matrix).concat(g_rightPropMatrix).invert().transpose().elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    // plane
    first += count;
    count = g_plane.mesh.length / 3;
    gl.bindTexture(gl.TEXTURE_2D, g_planeTexPointer);
    gl.uniformMatrix4fv(g_u_model_ref, false, g_planeMatrix.elements);
    gl.uniformMatrix4fv(g_u_inversetranspose_ref, false, new Matrix4(g_planeMatrix).invert().transpose().elements);
    gl.drawArrays(gl.TRIANGLES, first, count);

    // uboat
    first += count;
    count = g_uboat.mesh.length / 3;
    if (g_planeLaunched && g_explScale < 50) {
        gl.bindTexture(gl.TEXTURE_2D, g_uboatTexPointer);
        gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4().setTranslate(0, 0, -ISLAND_DIST).concat(g_uboatMatrix).elements);
        gl.uniformMatrix4fv(g_u_inversetranspose_ref, false, new Matrix4().setTranslate(0, 0, -ISLAND_DIST).concat(g_uboatMatrix).invert().transpose().elements);
        gl.drawArrays(gl.TRIANGLES, first, count);
    }

    gl.uniform1i(g_u_flatlighting_ref, true);

    // torp
    first += count;
    count = g_torpMesh.length / 3;
    if (g_torpFired && !g_hit) {
        gl.uniformMatrix4fv(g_u_model_ref, false, g_torpMatrix.elements);
        gl.drawArrays(gl.TRIANGLES, first, count);
    }

    // explosion
    first += count;
    count = g_explMesh.length / 3;
    if (g_hit) {
        gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_explMatrix).scale(g_explScale, g_explScale, g_explScale).elements);
        gl.drawArrays(gl.TRIANGLES, first, count);
    }

    gl.activeTexture(gl.TEXTURE9);
    gl.uniform1i(g_u_drawSkybox_ref, true);

    // skybox
    first += count;
    count = SQUARE_MESH.length / 3;
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, g_skyboxTexPointer);
    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4().elements);
    if (g_isDetached) {
        const cameraRot = new Matrix4().setFromQuat(g_cameraRot.x, g_cameraRot.y, -g_cameraRot.z, g_cameraRot.w);
        const cameraProjectionInverse = new Matrix4(projectionMatrix).concat(cameraRot);
        gl.uniformMatrix4fv(g_u_cameraProjectionInverse_ref, false, cameraProjectionInverse.elements);
    } else {
        const cameraDist = g_cameraDistance;
        g_cameraDistance = 0.25;
        const cameraProjectionInverse = new Matrix4(projectionMatrix).concat(calculateCamera()).invert();
        g_cameraDistance = cameraDist;
        gl.uniformMatrix4fv(g_u_cameraProjectionInverse_ref, false, cameraProjectionInverse.elements);
    }
    gl.drawArrays(gl.TRIANGLES, first, count);

    gl.activeTexture(gl.TEXTURE8);
    gl.uniform1i(g_u_drawSkybox_ref, false);

    gl.bindBuffer(gl.ARRAY_BUFFER, VBO2);
    if (!setupVec(3, 'a_Position', 0, 0)) {
        return;
    }
    if (!setupVec(3, 'a_Color', 0, g_islandMesh.length * FLOAT_SIZE)) {
        return;
    }
    if (!setupVec(3, 'a_Normal', 0, 2 * g_islandMesh.length * FLOAT_SIZE)) {
        return;
    }
    if (!setupVec(2, 'a_TexCoord', 0, 3 * g_islandMesh.length * FLOAT_SIZE)) {
        return;
    }

    gl.uniform1i(g_u_flatlighting_ref, false);
    gl.uniform1f(g_u_specpower_ref, 4);
    gl.uniform1f(g_u_specInten_ref, 1);

    // island
    gl.bindTexture(gl.TEXTURE_2D, g_islandTexPointer);
    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4().setTranslate(0, 0, -ISLAND_DIST).concat(g_islandMatrix).elements);
    gl.uniformMatrix4fv(g_u_inversetranspose_ref, false, new Matrix4().setTranslate(0, 0, -ISLAND_DIST).concat(g_islandMatrix).invert().transpose().elements);
    gl.drawArrays(gl.TRIANGLES, 0, g_islandMesh.length / 3);

    gl.disableVertexAttribArray(gl.getAttribLocation(gl.program, 'a_Position'));
    gl.disableVertexAttribArray(gl.getAttribLocation(gl.program, 'a_Color'));
    gl.disableVertexAttribArray(gl.getAttribLocation(gl.program, 'a_Normal'));
    gl.disableVertexAttribArray(gl.getAttribLocation(gl.program, 'a_TexCoord'));
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
        rotation.multiplySelf(new Quaternion().setFromAxisAngle(...axisY, -CAMERA_SPEED_ROT * inputAD));
        rotation.multiplySelf(new Quaternion().setFromAxisAngle(...axisX, -CAMERA_SPEED_ROT * inputRF));
        rotation.multiplySelf(new Quaternion().setFromAxisAngle(...axisZ, -CAMERA_SPEED_ROT * inputQE));
        g_cameraRot.multiplySelf(rotation);
        rotation.inverse();
        rotation.multiplyVector3(g_cameraAxisX);
        rotation.multiplyVector3(g_cameraAxisY);
        rotation.multiplyVector3(g_cameraAxisZ);
    } else {
        g_cameraDistance -= CAMERA_SPEED_DIST * deltaTime * inputWS;
        g_cameraDistance = Math.max(g_cameraDistance, 10);
        g_cameraAngle += CAMERA_SPEED_ANGLE * deltaTime * inputAD;
        g_cameraHeight = Math.max(0.1, g_cameraHeight + CAMERA_SPEED_HEIGHT * deltaTime * inputRF);
    }
}

const ROTATION_SPEED = 1;
let g_uboatAngle = 0;
const PLANE_SPEED = 0.15;
const TORP_SPEED = 0.05;
let g_planeLaunched = true;
let g_torpFired = false;
let g_torpDist = 50;
let g_hit = false;
let g_explScale = 0;
let g_skyColor = SKY_COLOR;
function tick() {
    const currentTime = Date.now();
    const deltaTime = currentTime - g_lastFrameMS;
    g_lastFrameMS = currentTime;

    updateCamera(deltaTime);

    const angle = ROTATION_SPEED * deltaTime;
    g_leftPropMatrix.rotate(angle, 0, 0, 1);
    g_rightPropMatrix.rotate(angle, 0, 0, 1);
    g_uboatAngle += angle / 50;
    if (g_uboatAngle > 360) {
        g_uboatAngle -= 360;
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
            g_uboatAngle > 160 && g_uboatAngle < 200) {
            g_hit = true;
            gl.uniform1f(g_u_explDist_ref, g_torpDist);
        }
        g_torpMatrix = new Matrix4().setTranslate(0, 0, -speed).concat(g_torpMatrix).rotate(angle / 2, 0, 0, 1);
    }

    if (g_hit && g_explScale < 150) {
        g_explScale += deltaTime / 2;
        const brightness = 15 - g_explScale / 10;
        gl.uniform1f(g_u_explInten_ref, brightness);
        g_skyColor = SKY_COLOR.map(color => color + brightness);

    } else if (g_explScale >= 150) {
        g_explMatrix.setScale(0, 0, 0);
        gl.uniform1f(g_u_explInten_ref, 0);
        g_skyColor = SKY_COLOR;
    }

    draw(deltaTime / 1000);
    requestAnimationFrame(tick, g_canvas);
}

let g_i400Matrix = new Matrix4();
let g_leftPropMatrix = new Matrix4().setTranslate(-2.2903, -4.7443, 54.25);
let g_rightPropMatrix = new Matrix4().setTranslate(2.2902, -4.7443, 54.25);
const ISLAND_DIST = 500;
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

let g_islandMesh, g_islandNormals, g_islandTexCoords;
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

    g_islandNormals = [];
    for (let i = 0; i < island.length; i += 3) {
        const p0 = island[i], p1 = island[i + 1], p2 = island[i + 2];
        const v1 = new Vector3([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
        const v2 = new Vector3([p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]]);
        const normal = v1.cross(v2).normalize();
        g_islandNormals.push(...normal.elements, ...normal.elements, ...normal.elements);
    }

    g_islandTexCoords = [];
    for (let i = 0; i < island.length; i++) {
        const distance = Math.pow(island[i][0] - size / 2, 2) + Math.pow(island[i][2] - size / 2, 2);
        const overSize = distance - Math.pow(size / 3, 2);
        if (overSize > size) {
            g_islandTexCoords.push(island[i][0] / size / 2, island[i][2] / size / 2);
        } else {
            g_islandTexCoords.push(island[i][0] / size / 2 + 0.5, island[i][2] / size / 2 + 0.5);
        }
    }

    VBO2 = initVBO(new Float32Array(g_islandMesh.concat(islandColors).concat(g_islandNormals).concat(g_islandTexCoords)));
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
const SQUARE_MESH = [
    1, 1, 1,
    -1, 1, 1,
    -1, -1, 1,
    1, 1, 1,
    -1, -1, 1,
    1, -1, 1,
];
let VBO1, VBO2;
let g_islandSize = 50;
let g_islandRadius;
let g_u_model_ref, g_u_camera_ref, g_u_projection_ref;
let g_u_flatlighting_ref, g_u_drawSkybox_ref;
let g_u_inversetranspose_ref, g_u_cameraProjectionInverse_ref;
let g_u_light_ref, g_u_specpower_ref, g_u_specInten_ref;
let g_u_texture_ref, g_u_skybox_ref;
let g_u_explDist_ref, g_u_explInten_ref;
let g_i400TexPointer, g_planeTexPointer, g_uboatTexPointer, g_islandTexPointer;
let g_skyboxTexPointer;
let g_meshLen;

let g_simulator;
function startRendering() {
    g_simulator = new Simulator();

    if (!initShaders(gl, g_vshader, g_fshader)) {
        console.log('Failed to intialize shaders.');
        return;
    }

    const i400BodyColors = buildI400ColorAttributes(g_i400Body.mesh.length / 3, g_i400Body.mesh);
    const i400HatchColors = buildColorAttributes(g_i400Hatch.mesh.length / 3);
    const i400PropColors = buildPropColorAttributes(g_i400Prop.mesh.length / 3);
    const planeColors = buildPlaneColorAttributes(g_plane.mesh.length / 3);
    const uboatColors = buildColorAttributes(g_uboat.mesh.length / 3);
    const torpColors = buildColorAttributes(g_torpMesh.length / 3);
    const explColors = buildExplColorAttributes(g_explMesh.length / 3);

    const VBOData = g_i400Body.mesh.concat(g_i400Hatch.mesh).concat(g_i400Prop.mesh).concat(g_plane.mesh).concat(g_uboat.mesh).concat(g_torpMesh).concat(g_explMesh).concat(SQUARE_MESH)
        .concat(i400BodyColors).concat(i400HatchColors).concat(i400PropColors).concat(planeColors).concat(uboatColors).concat(torpColors).concat(explColors).concat(SQUARE_MESH)
        .concat(g_i400Body.normals).concat(g_i400Hatch.normals).concat(g_i400Prop.normals).concat(g_plane.normals).concat(g_uboat.normals).concat(g_torpMesh).concat(g_explMesh).concat(SQUARE_MESH)
        .concat(g_i400Body.texCoords).concat(g_i400Hatch.texCoords).concat(g_i400Prop.texCoords).concat(g_plane.texCoords).concat(g_uboat.texCoords).concat(g_torpMesh).concat(g_explMesh).concat(SQUARE_MESH);
    VBO1 = initVBO(new Float32Array(VBOData));

    generateIsland(g_islandSize);

    g_u_model_ref = gl.getUniformLocation(gl.program, 'u_Model');
    g_u_camera_ref = gl.getUniformLocation(gl.program, 'u_Camera');
    g_u_projection_ref = gl.getUniformLocation(gl.program, 'u_Projection');

    g_u_flatlighting_ref = gl.getUniformLocation(gl.program, 'u_FlatLighting');
    g_u_drawSkybox_ref = gl.getUniformLocation(gl.program, 'u_DrawSkybox');
    g_u_inversetranspose_ref = gl.getUniformLocation(gl.program, 'u_ModelInverseTranspose');
    g_u_cameraProjectionInverse_ref = gl.getUniformLocation(gl.program, 'u_CameraProjectionInverse');

    g_u_light_ref = gl.getUniformLocation(gl.program, 'u_Light');
    g_u_specpower_ref = gl.getUniformLocation(gl.program, 'u_SpecPower');
    g_u_specInten_ref = gl.getUniformLocation(gl.program, 'u_SpecInten');

    g_u_texture_ref = gl.getUniformLocation(gl.program, 'u_Texture');
    g_u_skybox_ref = gl.getUniformLocation(gl.program, 'u_Skybox');

    g_u_explDist_ref = gl.getUniformLocation(gl.program, 'u_ExplDist');
    g_u_explInten_ref = gl.getUniformLocation(gl.program, 'u_ExplInten');

    g_islandRadius = g_islandSize * 5 / 2;
    resetMatrices();

    gl.activeTexture(gl.TEXTURE8);

    g_i400TexPointer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, g_i400TexPointer);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, g_i400Image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    g_planeTexPointer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, g_planeTexPointer);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, g_planeImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    g_uboatTexPointer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, g_uboatTexPointer);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, g_uboatImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    g_islandTexPointer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, g_islandTexPointer);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, g_islandImage);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    gl.activeTexture(gl.TEXTURE9);

    g_skyboxTexPointer = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_CUBE_MAP, g_skyboxTexPointer);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_X, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, g_skybox.posX);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Y, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, g_skybox.posY);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_POSITIVE_Z, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, g_skybox.posZ);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_X, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, g_skybox.negX);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Y, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, g_skybox.negY);
    gl.texImage2D(gl.TEXTURE_CUBE_MAP_NEGATIVE_Z, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, g_skybox.negZ);
    gl.generateMipmap(gl.TEXTURE_CUBE_MAP);

    g_meshLen = g_i400Body.mesh.length + g_i400Hatch.mesh.length + g_i400Prop.mesh.length + g_plane.mesh.length
        + g_uboat.mesh.length + g_torpMesh.length + g_explMesh.length + SQUARE_MESH.length;
}

let g_vshader, g_fshader;
async function loadGLSLFiles() {
    g_vshader = await fetch('./final_project.vert').then(response => response.text()).then((x) => x);
    g_fshader = await fetch('./final_project.frag').then(response => response.text()).then((x) => x);
}

let g_i400Image = new Image();
let g_planeImage = new Image();
let g_uboatImage = new Image();
let g_islandImage = new Image();
let g_skybox = {
    posX: new Image(), negX: new Image(),
    posY: new Image(), negY: new Image(),
    posZ: new Image(), negZ: new Image()
};
async function loadImageFiles() {
    g_i400Image.src = "resources/I400Body.png";
    await g_i400Image.decode();
    g_planeImage.src = "resources/Plane.png";
    await g_planeImage.decode();
    g_uboatImage.src = "resources/Uboat.png";
    await g_uboatImage.decode();
    g_islandImage.src = "resources/Island.png";
    await g_islandImage.decode();

    g_skybox.posX.src = "resources/skybox/right.jpg";
    g_skybox.posY.src = "resources/skybox/top.jpg";
    g_skybox.posZ.src = "resources/skybox/back.jpg";
    g_skybox.negX.src = "resources/skybox/left.jpg";
    g_skybox.negY.src = "resources/skybox/bottom.jpg";
    g_skybox.negZ.src = "resources/skybox/front.jpg";
    await g_skybox.posX.decode();
    await g_skybox.posY.decode();
    await g_skybox.posZ.decode();
    await g_skybox.negX.decode();
    await g_skybox.negY.decode();
    await g_skybox.negZ.decode();
}

let g_i400Body = {  mesh: [], normals: [], texCoords: [] };
let g_i400Hatch = { mesh: [], normals: [], texCoords: [] };
let g_i400Prop = { mesh: [], normals: [], texCoords: [] };
let g_plane = { mesh: [], normals: [], texCoords: [] };
let g_uboat = { mesh: [], normals: [], texCoords: [] };
let g_torpMesh = [];
let g_explMesh = [];
async function loadOBJFiles() {
    const files = [
        { path: './resources/I400Body.obj', model: g_i400Body },
        { path: './resources/I400Hatch.obj', model: g_i400Hatch },
        { path: './resources/I400Prop.obj', model: g_i400Prop },
        { path: './resources/Plane.obj', model: g_plane },
        { path: './resources/Uboat.obj', model: g_uboat },
        { path: './resources/Torpedo.obj', mesh: g_torpMesh },
        { path: './resources/Explosion.obj', mesh: g_explMesh }
    ];

    await Promise.all(files.map(async (file) => {
        const response = await fetch(file.path);
        const data = await response.text();
        if (file.model) {
            return readObjFile(data, file.model.mesh, file.model.normals, file.model.texCoords);
        }
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

let g_torpBtn;
let g_resetBtn;
let g_instLabel;
let g_sizeSld;
let g_canvas, gl;
let g_lastFrameMS;
async function main() {
    setupKeyBinds();
    g_torpBtn = document.getElementById('torpedo');
    g_resetBtn = document.getElementById('reset');
    g_instLabel = document.getElementById('instruction');
    g_sizeSld = document.getElementById('size');

    g_canvas = document.getElementById('canvas');
    gl = getWebGLContext(g_canvas, true);
    if (!gl) {
        console.log('Failed to get the rendering context for WebGL');
        return;
    }

    await loadImageFiles();
    await loadGLSLFiles();
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
    if (g_isDetached) {
        g_cameraPos = [0, 30, 100];
        g_cameraAxisX = new Vector3([1, 0, 0]);
        g_cameraAxisY = new Vector3([0, 1, 0]);
        g_cameraAxisZ = new Vector3([0, 0, 1]);
        g_cameraRot = new Quaternion();
        g_instLabel.innerHTML = 'W/S: Move foward/backward&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;A/D: Yaw&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;R/F: Pitch&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Q/E: Roll';
    } else {
        g_instLabel.innerHTML = 'W/S: Move closer/farther&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;A/D: Orbit left/right&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;R/F: Move up/down';
    }
}

function regenerate() {
    g_islandSize = g_sizeSld.value;
    g_islandRadius = g_islandSize * 5 / 2;
    reset();
    generateIsland(g_islandSize);
}
