// Last edited by Dietrich Geisler 2025

const VSHADER_SOURCE = `
    attribute vec3 a_Position;
    uniform mat4 u_Model;
    uniform mat4 u_View;
    uniform mat4 u_Proj;
    attribute vec3 a_Color;
    varying vec3 v_Color;
    void main() {
        gl_Position = u_Proj * u_View * u_Model * vec4(a_Position, 1.0);
        v_Color = a_Color;
    }
`

const FSHADER_SOURCE = `
    varying mediump vec3 v_Color;
    void main() {
        gl_FragColor = vec4(v_Color, 1.0);
    }
`

// references to general information
var g_canvas
var gl
var g_lastFrameMS

// GLSL uniform references
var g_u_model_ref
var g_u_view_ref
var g_u_proj_ref

// usual model/world matrices
var g_i400Matrix
var g_leftPropMatrix
var g_rightPropMatrix
var g_planeMatrix
var g_uboatMatrix
var g_torpMatrix
var g_explMatrix

// camera projection values
var g_camera_x
var g_camera_y
var g_camera_z
var g_isPerspective
var g_isTargeting

// Mesh definitions
var g_i400BodyMesh
var g_i400HatchMesh
var g_i400PropMesh
var g_planeMesh
var g_uboatMesh
var g_gridMesh
var g_torpMesh
var g_explMesh

// We're using triangles, so our vertices each have 3 elements
const TRIANGLE_SIZE = 3

// The size in bytes of a floating point
const FLOAT_SIZE = 4

var g_moving_up = false
var g_moving_left = false
var g_moving_down = false
var g_moving_right = false
var g_moving_back = false
var g_moving_foward = false

function main() {
    window.addEventListener('keydown', function (event) {
        switch (event.key.toLowerCase()) {
            case 'w':
                g_moving_up = true
                break
            case 'a':
                g_moving_left = true
                break
            case 's':
                g_moving_down = true
                break
            case 'd':
                g_moving_right = true
                break
            case 'q':
                g_moving_back = true
                break
            case 'e':
                g_moving_foward = true
                break
        }
    })
    window.addEventListener('keyup', function (event) {
        switch (event.key.toLowerCase()) {
            case 'w':
                g_moving_up = false
                break
            case 'a':
                g_moving_left = false
                break
            case 's':
                g_moving_down = false
                break
            case 'd':
                g_moving_right = false
                break
            case 'q':
                g_moving_back = false
                break
            case 'e':
                g_moving_foward = false
                break
        }
    })

    g_canvas = document.getElementById('canvas')

    // Get the rendering context for WebGL
    gl = getWebGLContext(g_canvas, true)
    if (!gl) {
        console.log('Failed to get the rendering context for WebGL')
        return
    }

    // We will call this at the end of most main functions from now on
    loadOBJFiles()
}

/*
 * Helper function to load OBJ files in sequence
 * For much larger files, you may are welcome to make this more parallel
 * I made everything sequential for this class to make the logic easier to follow
 */
async function loadOBJFiles() {
    // open our OBJ file(s)
    data = await fetch('./resources/I400Body.obj').then(response => response.text()).then((x) => x)
    g_i400BodyMesh = []
    readObjFile(data, g_i400BodyMesh)

    data = await fetch('./resources/I400Hatch.obj').then(response => response.text()).then((x) => x)
    g_i400HatchMesh = []
    readObjFile(data, g_i400HatchMesh)

    data = await fetch('./resources/I400Prop.obj').then(response => response.text()).then((x) => x)
    g_i400PropMesh = []
    readObjFile(data, g_i400PropMesh)

    data = await fetch('./resources/Plane.obj').then(response => response.text()).then((x) => x)
    g_planeMesh = []
    readObjFile(data, g_planeMesh)

    data = await fetch('./resources/Uboat.obj').then(response => response.text()).then((x) => x)
    g_uboatMesh = []
    readObjFile(data, g_uboatMesh)

    data = await fetch('./resources/Torpedo.obj').then(response => response.text()).then((x) => x)
    g_torpMesh = []
    readObjFile(data, g_torpMesh)

    data = await fetch('./resources/Explosion.obj').then(response => response.text()).then((x) => x)
    g_explMesh = []
    readObjFile(data, g_explMesh)

    // Wait to load our models before starting to render
    startRendering()
}

const UBOAT_DIST = 10

function startRendering() {
    // Initialize GPU's vertex and fragment shaders programs
    if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
        console.log('Failed to intialize shaders.')
        return
    }

    // initialize the VBO
    var i400BodyColors = buildI400ColorAttributes(g_i400BodyMesh.length / 3, g_i400BodyMesh)
    var i400HatchColors = buildColorAttributes(g_i400HatchMesh.length / 3)
    var i400PropColors = buildPropColorAttributes(g_i400PropMesh.length / 3)
    var planeColors = buildPlaneColorAttributes(g_planeMesh.length / 3)
    var uboatColors = buildColorAttributes(g_uboatMesh.length / 3)
    var torpColors = buildColorAttributes(g_torpMesh.length / 3)
    var explColors = buildExplColorAttributes(g_explMesh.length / 3)
    var gridInfo = buildGridAttributes(1, 1, [0.0, 0.0, 1.0])
    g_gridMesh = gridInfo[0]
    var data = g_i400BodyMesh.concat(g_i400HatchMesh).concat(g_i400PropMesh).concat(g_planeMesh).concat(g_uboatMesh).concat(g_torpMesh).concat(g_explMesh).concat(gridInfo[0]).
        concat(i400BodyColors).concat(i400HatchColors).concat(i400PropColors).concat(planeColors).concat(uboatColors).concat(torpColors).concat(explColors).concat(gridInfo[1])
    if (!initVBO(new Float32Array(data))) {
        return
    }

    // Send our vertex data to the GPU
    if (!setupVec3('a_Position', 0, 0)) {
        return
    }
    if (!setupVec3('a_Color', 0, (g_i400BodyMesh.length + g_i400HatchMesh.length + g_i400PropMesh.length + g_planeMesh.length +
        g_uboatMesh.length + g_torpMesh.length + g_explMesh.length + gridInfo[0].length) * FLOAT_SIZE)) {
        return -1
    }

    // Get references to GLSL uniforms
    g_u_model_ref = gl.getUniformLocation(gl.program, 'u_Model')
    g_u_view_ref = gl.getUniformLocation(gl.program, 'u_View')
    g_u_proj_ref = gl.getUniformLocation(gl.program, 'u_Proj')

    // Reposition our mesh
    g_i400Matrix = new Matrix4().setScale(0.015625, 0.015625, 0.015625)
    g_leftPropMatrix = new Matrix4().setTranslate(54.25, -4.7443, 2.2903)
    g_rightPropMatrix = new Matrix4().setTranslate(54.25, -4.7443, -2.2902)
    g_planeMatrix = new Matrix4()
    g_uboatMatrix = new Matrix4().setTranslate(-UBOAT_DIST, 0, 0).scale(0.03125, 0.03125, 0.03125)
    g_torpMatrix = new Matrix4().setTranslate(-0.9, -0.04, 0).scale(0.0625, 0.0625, 0.0625)
    g_explMatrix = new Matrix4().setTranslate(-UBOAT_DIST + 0.5, 0, 0).scale(0.1, 0.1, 0.1)

    // Enable culling and depth tests
    gl.enable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)

    // Setup for ticks
    g_lastFrameMS = Date.now()

    // Initially set our camera to be at the origin
    updateCameraX(0)
    updateCameraY(0.5)
    updateCameraZ(1)
    g_isPerspective = true
    g_isTargeting = false

    tick()
}

function updateCameraX(amount) {
    label = document.getElementById('cameraX')
    label.textContent = `Camera X: ${Number(amount).toFixed(2)}`
    g_camera_x = Number(amount)
}
function updateCameraY(amount) {
    label = document.getElementById('cameraY')
    label.textContent = `Camera Y: ${Number(amount).toFixed(2)}`
    g_camera_y = Number(amount)
}
function updateCameraZ(amount) {
    label = document.getElementById('cameraZ')
    label.textContent = `Camera Z: ${Number(amount).toFixed(2)}`
    g_camera_z = Number(amount)
}

function togglePerspective() {
    g_isPerspective = !g_isPerspective
}
function switchTarget() {
    g_isTargeting = !g_isTargeting
    if (g_isTargeting) {
        updateCameraX(g_camera_x + UBOAT_DIST)
    } else {
        updateCameraX(g_camera_x - UBOAT_DIST)
    }
}

// extra constants for cleanliness
const CAMERA_SPEED = 0.002
const ROTATION_SPEED = 1
const PLANE_SPEED = 0.125
const SUB_SPEED = 0.0001
const TORP_SPEED = 0.001

var g_planeLaunched = false
var g_torpFired = false
function launchPlane() {
    g_planeLaunched = true
    document.getElementById("plane").disabled = true
    document.getElementById("target").disabled = false
    document.getElementById("torpedo").disabled = false
    document.getElementById("reset").disabled = false
}
function fireTorp() {
    g_torpFired = true
    document.getElementById("torpedo").disabled = true
}

var g_distance_sub = 0
var g_distance_torp = 0
var g_hit = false
var g_explScale = 0

function reset() {
    if (g_isTargeting) {
        switchTarget()
    }
    g_planeLaunched = false
    g_planeMatrix.setIdentity()
    g_torpFired = false
    g_distance_torp = 0
    g_torpMatrix.setTranslate(-0.9, -0.04, 0).scale(0.0625, 0.0625, 0.0625)
    g_hit = false
    g_explScale = 0
    g_explMatrix.setTranslate(-UBOAT_DIST + 0.5, 0, 0).scale(0.1, 0.1, 0.1)
    document.getElementById("plane").disabled = false
    document.getElementById("target").disabled = true
    document.getElementById("torpedo").disabled = true
    document.getElementById("reset").disabled = true
}

// function to apply all the logic for a single frame tick
function tick() {
    // time since the last frame
    var deltaTime

    // calculate deltaTime
    var current_time = Date.now()
    deltaTime = current_time - g_lastFrameMS
    g_lastFrameMS = current_time

    if (g_moving_up) {
        updateCameraY(g_camera_y + CAMERA_SPEED * deltaTime)
    }
    if (g_moving_left) {
        updateCameraX(g_camera_x - CAMERA_SPEED * deltaTime)
    }
    if (g_moving_down) {
        updateCameraY(g_camera_y - CAMERA_SPEED * deltaTime)
    }
    if (g_moving_right) {
        updateCameraX(g_camera_x + CAMERA_SPEED * deltaTime)
    }
    if (g_moving_back) {
        updateCameraZ(g_camera_z + CAMERA_SPEED * deltaTime)
    }
    if (g_moving_foward) {
        updateCameraZ(g_camera_z - CAMERA_SPEED * deltaTime)
    }

    // rotate the arm constantly around the given axis (of the model)
    var angle = -ROTATION_SPEED * deltaTime
    g_leftPropMatrix.rotate(angle, 1, 0, 0)
    g_rightPropMatrix.rotate(angle, 1, 0, 0)

    var speed = -PLANE_SPEED * deltaTime
    if (g_planeLaunched) {
        g_planeMatrix.translate(speed, speed * Math.tan(-0.0625), 0)
    }

    speed = -TORP_SPEED * deltaTime
    if (g_torpFired) {
        g_distance_torp -= speed
        if (g_distance_torp > UBOAT_DIST - 1.3) {
            g_hit = true
        }
        g_torpMatrix = new Matrix4().setTranslate(speed, 0, 0).concat(g_torpMatrix).rotate(angle / 2, 1, 0, 0)
    }

    if (g_hit && g_explScale < 25) {
        g_explScale += 0.1 * deltaTime
    }
    if (g_explScale >= 25) {
        g_explMatrix.setScale(0, 0, 0)
    }

    g_distance_sub += SUB_SPEED * deltaTime

    draw()

    requestAnimationFrame(tick, g_canvas)
}

// draw to the screen on the next frame
function draw() {
    // Setup our camera
    var viewMatrix = new Matrix4()
    var projMatrix = new Matrix4()
    if (g_isPerspective) {
        viewMatrix.setLookAt(
            -g_camera_x, g_camera_y, -g_camera_z,
            -UBOAT_DIST * g_isTargeting, 0, 0,
            0, 1, 0
        )
        projMatrix.setPerspective(60, 1.777778, 0.1, 100)
    } else {
        viewMatrix.setLookAt(
            -UBOAT_DIST * g_isTargeting, 0, 0,
            g_isTargeting ? g_camera_x - 2 * UBOAT_DIST : g_camera_x, -g_camera_y, g_camera_z,
            0, 1, 0
        )
        projMatrix.setOrtho(-1.6, 1.6, -0.9, 0.9, -100, 100)
    }

    // Update with our global transformation matrices
    gl.uniformMatrix4fv(g_u_model_ref, false, g_i400Matrix.elements)
    gl.uniformMatrix4fv(g_u_view_ref, false, viewMatrix.elements)
    gl.uniformMatrix4fv(g_u_proj_ref, false, projMatrix.elements)

    // Clear the canvas with a black background
    gl.clearColor(0.0, 0.75, 1.0, 1.0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    // Draw our models
    var first = 0, count = g_i400BodyMesh.length / 3
    gl.drawArrays(gl.TRIANGLES, first, count)

    first += count
    count = g_i400HatchMesh.length / 3
    gl.drawArrays(gl.TRIANGLES, first, count)

    first += count
    count = g_i400PropMesh.length / 3
    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_i400Matrix).concat(g_leftPropMatrix).elements)
    gl.drawArrays(gl.TRIANGLES, first, count)

    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_i400Matrix).concat(g_rightPropMatrix).elements)
    gl.drawArrays(gl.TRIANGLES, first, count)

    first += count
    count = g_planeMesh.length / 3
    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_i400Matrix).concat(g_planeMatrix).elements)
    gl.drawArrays(gl.TRIANGLES, first, count)

    first += count
    count = g_uboatMesh.length / 3
    if (g_planeLaunched && g_explScale < 10) {
        gl.uniformMatrix4fv(g_u_model_ref, false, g_uboatMatrix.elements)
        gl.drawArrays(gl.TRIANGLES, first, count)
    }

    first += count
    count = g_torpMesh.length / 3
    if (g_torpFired && !g_hit) {
        gl.uniformMatrix4fv(g_u_model_ref, false, g_torpMatrix.elements)
        gl.drawArrays(gl.TRIANGLES, first, count)
    }

    first += count
    count = g_explMesh.length / 3
    if (g_hit) {
        gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_explMatrix).scale(g_explScale, g_explScale, g_explScale).elements)
        gl.drawArrays(gl.TRIANGLES, first, count)
    }

    // the grid has a constant matrix for model
    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4().translate(g_distance_sub, GRID_Y_OFFSET, 0).scale(0.25, 0.25, 0.25).elements)
    // draw the grid
    first += count
    gl.drawArrays(gl.LINES, first, g_gridMesh.length / 3)
}

// Helper to construct colors
// makes every triangle a slightly different shade of gray
function buildColorAttributes(vertex_count) {
    var colors = []
    for (var i = 0; i < vertex_count / 3; i++) {
        // three vertices per triangle
        for (var vert = 0; vert < 3; vert++) {
            var shade = i * 3 / vertex_count
            colors.push(shade, shade, shade)
        }
    }
    return colors
}

function buildI400ColorAttributes(vertex_count, mesh) {
    var colors = []
    for (var i = 0; i < vertex_count / 3; i++) {
        // three vertices per triangle
        for (var vert = 0; vert < 3; vert++) {
            var shade = i * 3 / vertex_count
            if (shade > 0.75) {
                shade = shade * 4 - 3
            }
            if (mesh[(i * 3 + vert) * 3 + 1] < -0.5) {
                colors.push(shade, 0, 0)
            } else {
                colors.push(shade, shade, shade)
            }
        }
    }
    return colors
}

function buildPropColorAttributes(vertex_count) {
    var colors = []
    for (var i = 0; i < vertex_count / 3; i++) {
        // three vertices per triangle
        for (var vert = 0; vert < 3; vert++) {
            var shade = i * 1.5 / vertex_count + 0.5
            colors.push(shade, shade, 0)
        }
    }
    return colors
}

function buildPlaneColorAttributes(vertex_count) {
    var colors = []
    for (var i = 0; i < vertex_count / 3; i++) {
        // three vertices per triangle
        for (var vert = 0; vert < 3; vert++) {
            var shade = i * 1.5 / vertex_count
            colors.push(shade, 0.5, shade)
        }
    }
    return colors
}

function buildExplColorAttributes(vertex_count) {
    var colors = []
    for (var i = 0; i < vertex_count / 3; i++) {
        // three vertices per triangle
        for (var vert = 0; vert < 3; vert++) {
            colors.push(1, 1, 1)
        }
    }
    return colors
}

// How far in the X and Z directions the grid should extend
// Recall that the camera "rests" on the X/Z plane, since Z is "out" from the camera
const GRID_X_RANGE = 1000
const GRID_Z_RANGE = 1000

// The default y-offset of the grid for rendering
const GRID_Y_OFFSET = 0

/*
 * Helper to build a grid mesh and colors
 * Returns these results as a pair of arrays
 * Each vertex in the mesh is constructed with an associated grid_color
 */
function buildGridAttributes(grid_row_spacing, grid_column_spacing, grid_color) {
    var mesh = []
    var colors = []

    // Construct the rows
    for (var x = -GRID_X_RANGE; x < GRID_X_RANGE; x += grid_row_spacing) {
        // two vertices for each line
        // one at -Z and one at +Z
        mesh.push(x, 0, -GRID_Z_RANGE)
        mesh.push(x, 0, GRID_Z_RANGE)
    }

    // Construct the columns extending "outward" from the camera
    for (var z = -GRID_Z_RANGE; z < GRID_Z_RANGE; z += grid_column_spacing) {
        // two vertices for each line
        // one at -Z and one at +Z
        mesh.push(-GRID_X_RANGE, 0, z)
        mesh.push(GRID_X_RANGE, 0, z)
    }

    // We need one color per vertex
    // since we have 3 components for each vertex, this is length/3
    for (var i = 0; i < mesh.length / 3; i++) {
        colors.push(grid_color[0], grid_color[1], grid_color[2])
    }

    return [mesh, colors]
}

/*
 * Initialize the VBO with the provided data
 * Assumes we are going to have "static" (unchanging) data
 */
function initVBO(data) {
    // get the VBO handle
    var VBOloc = gl.createBuffer()
    if (!VBOloc) {
        return false
    }

    // Bind the VBO to the GPU array and copy `data` into that VBO
    gl.bindBuffer(gl.ARRAY_BUFFER, VBOloc)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)

    return true
}

/*
 * Helper function to load the given vec3 data chunk onto the VBO
 * Requires that the VBO already be setup and assigned to the GPU
 */
function setupVec3(name, stride, offset) {
    // Get the attribute by name
    var attributeID = gl.getAttribLocation(gl.program, `${name}`)
    if (attributeID < 0) {
        console.log(`Failed to get the storage location of ${name}`)
        return false
    }

    // Set how the GPU fills the a_Position variable with data from the GPU 
    gl.vertexAttribPointer(attributeID, 3, gl.FLOAT, false, stride, offset)
    gl.enableVertexAttribArray(attributeID)

    return true
}