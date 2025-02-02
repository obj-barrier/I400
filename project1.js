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
var g_leftPropMatrix
var g_rightPropMatrix
var g_planeMatrix
var g_modelMatrix

// camera projection values
var g_camera_x
var g_camera_y
var g_camera_z
var g_isPerspective

// Mesh definitions
var g_i400BodyMesh
var g_i400HatchMesh
var g_i400PropMesh
var g_planeMesh
var g_gridMesh

// We're using triangles, so our vertices each have 3 elements
const TRIANGLE_SIZE = 3

// The size in bytes of a floating point
const FLOAT_SIZE = 4

function main() {
    // Setup our camera movement sliders
    slider_input = document.getElementById('sliderX')
    slider_input.addEventListener('input', (event) => {
        updateCameraX(event.target.value)
    })
    slider_input = document.getElementById('sliderY')
    slider_input.addEventListener('input', (event) => {
        updateCameraY(event.target.value)
    })
    slider_input = document.getElementById('sliderZ')
    slider_input.addEventListener('input', (event) => {
        updateCameraZ(event.target.value)
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

    // Wait to load our models before starting to render
    startRendering()
}

function startRendering() {
    // Initialize GPU's vertex and fragment shaders programs
    if (!initShaders(gl, VSHADER_SOURCE, FSHADER_SOURCE)) {
        console.log('Failed to intialize shaders.')
        return
    }

    // initialize the VBO
    var gridInfo = buildGridAttributes(1, 1, [0.0, 0.0, 1.0])
    g_gridMesh = gridInfo[0]
    var i400Length = g_i400BodyMesh.length + g_i400HatchMesh.length + g_i400PropMesh.length + g_planeMesh.length
    var i400Colors = buildColorAttributes(i400Length / 3)
    var data = g_i400BodyMesh.concat(g_i400HatchMesh).concat(g_i400PropMesh).concat(g_planeMesh).concat(gridInfo[0]).concat(i400Colors).concat(gridInfo[1])
    if (!initVBO(new Float32Array(data))) {
        return
    }

    // Send our vertex data to the GPU
    if (!setupVec3('a_Position', 0, 0)) {
        return
    }
    if (!setupVec3('a_Color', 0, (i400Length + gridInfo[0].length) * FLOAT_SIZE)) {
        return -1
    }

    // Get references to GLSL uniforms
    g_u_model_ref = gl.getUniformLocation(gl.program, 'u_Model')
    g_u_view_ref = gl.getUniformLocation(gl.program, 'u_View')
    g_u_proj_ref = gl.getUniformLocation(gl.program, 'u_Proj')

    // Reposition our mesh
    g_leftPropMatrix = new Matrix4().setTranslate(54.25, -4.7443, 2.2903)
    g_rightPropMatrix = new Matrix4().setTranslate(54.25, -4.7443, -2.2902)
    g_planeMatrix = new Matrix4()
    g_modelMatrix = new Matrix4().setScale(0.015625, 0.015625, -0.015625)

    // Enable culling and depth tests
    gl.enable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)

    // Setup for ticks
    g_lastFrameMS = Date.now()

    // Initially set our camera to be at the origin
    updateCameraX(0)
    updateCameraY(0)
    updateCameraZ(1)
    g_isPerspective = false

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
    g_modelMatrix.scale(1, 1, -1)
}

// extra constants for cleanliness
var ROTATION_SPEED = 1
var PLANE_SPEED = 0.125
var SUB_SPEED = 0.0001

var g_launching = false
function launchPlane() {
    g_launching = true
}
function resetPlane() {
    g_launching = false
}

var g_distance = 0

// function to apply all the logic for a single frame tick
function tick() {
    // time since the last frame
    var deltaTime

    // calculate deltaTime
    var current_time = Date.now()
    deltaTime = current_time - g_lastFrameMS
    g_lastFrameMS = current_time

    // rotate the arm constantly around the given axis (of the model)
    var angle = -ROTATION_SPEED * deltaTime
    g_leftPropMatrix.rotate(angle, 1, 0, 0)
    g_rightPropMatrix.rotate(angle, 1, 0, 0)

    var speed = -PLANE_SPEED * deltaTime
    if (g_launching) {
        g_planeMatrix.translate(speed, speed * Math.tan(-0.0625), 0)
    } else {
        g_planeMatrix.setIdentity()
    }

    g_distance += SUB_SPEED * deltaTime

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
            0, 0, 0,
            0, 1, 0
        )
        projMatrix.setPerspective(90, 1.777778, 0.1, 100)
    } else {
        viewMatrix.setLookAt(
            0, 0, 0,
            -g_camera_x, g_camera_y, g_camera_z,
            0, 1, 0
        )
        projMatrix.setOrtho(-1.6, 1.6, -0.9, 0.9, 2, -2)
    }

    // Update with our global transformation matrices
    gl.uniformMatrix4fv(g_u_model_ref, false, g_modelMatrix.elements)
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

    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_modelMatrix).concat(g_leftPropMatrix).elements)
    first += count
    count = g_i400PropMesh.length / 3
    gl.drawArrays(gl.TRIANGLES, first, count)

    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_modelMatrix).concat(g_rightPropMatrix).elements)
    gl.drawArrays(gl.TRIANGLES, first, count)

    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4(g_modelMatrix).concat(g_planeMatrix).elements)
    first += count
    count = g_planeMesh.length / 3
    gl.drawArrays(gl.TRIANGLES, first, count)

    // the grid has a constant identity matrix for model and world
    // world includes our Y offset
    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4().translate(g_distance, GRID_Y_OFFSET, 0).scale(0.25, 0.25, 0.25).elements)

    // draw the grid
    first += count
    gl.drawArrays(gl.LINES, first, g_gridMesh.length / 3)
}

// Helper to construct colors
// makes every triangle a slightly different shade of blue
function buildColorAttributes(vertex_count) {
    var colors = []
    for (var i = 0; i < vertex_count / 3; i++) {
        // three vertices per triangle
        for (var vert = 0; vert < 3; vert++) {
            var shade = (i * 3) / vertex_count
            colors.push(shade, shade, shade)
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