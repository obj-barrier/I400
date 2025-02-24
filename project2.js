// Last edited by Dietrich Geisler 2025

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

// references to general information
var g_canvas
var gl
var g_lastFrameMS

// GLSL uniform references
var g_u_model_ref
var g_u_camera_ref
var g_u_projection_ref

// usual model/world matrices
var g_i400Matrix
var g_leftPropMatrix
var g_rightPropMatrix
var g_planeMatrix
var g_uboatMatrix
var g_torpMatrix
var g_explMatrix

// camera/projection
var g_projectionMatrix

// keep track of the camera position, always looking at (0, height, 0)
var g_cameraDistance
var g_cameraAngle
var g_cameraHeight

// Mesh definitions
var g_i400BodyMesh
var g_i400HatchMesh
var g_i400PropMesh
var g_planeMesh
var g_uboatMesh
var g_torpMesh
var g_explMesh
var g_seaMesh
var g_islandMesh

// Key states
var g_movingUp
var g_movingDown
var g_movingLeft
var g_movingRight
var g_movingForward
var g_movingBackward

// We're using triangles, so our vertices each have 3 elements
const TRIANGLE_SIZE = 3

// The size in bytes of a floating point
const FLOAT_SIZE = 4

function main() {
    setupKeyBinds()

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

    var terrainGenerator = new TerrainGenerator()
    var seed = new Date().getMilliseconds()
    var options = {
        width: 1000,
        height: 0.25,
        depth: 1000,
        seed: seed,
        noisefn: "perlin", // "wave", "simplex" and "perlin"
        roughness: 500
    }
    var sea = terrainGenerator.generateTerrainMesh(options)
    var seaColors = buildSeaColors(sea, options.height)
    g_seaMesh = []
    for (var i = 0; i < sea.length; i++) {
        g_seaMesh.push(...sea[i])
    }

    options = {
        width: 15,
        height: 2,
        depth: 15,
        seed: seed,
        noisefn: "simplex", // "wave", "simplex" and "perlin"
        roughness: 5
    }
    var island = terrainGenerator.generateTerrainMesh(options)
    fixIsland(island, options.width, options.depth)
    var islandColors = buildIslandColors(island, options.height)
    g_islandMesh = []
    for (var i = 0; i < island.length; i++) {
        g_islandMesh.push(...island[i])
    }

    var data = g_i400BodyMesh.concat(g_i400HatchMesh).concat(g_i400PropMesh).concat(g_planeMesh).concat(g_uboatMesh).concat(g_torpMesh).concat(g_explMesh).concat(g_seaMesh).concat(g_islandMesh).
        concat(i400BodyColors).concat(i400HatchColors).concat(i400PropColors).concat(planeColors).concat(uboatColors).concat(torpColors).concat(explColors).concat(seaColors).concat(islandColors)
    if (!initVBO(new Float32Array(data))) {
        return
    }

    // Send our vertex data to the GPU
    if (!setupVec3('a_Position', 0, 0)) {
        return
    }
    if (!setupVec3('a_Color', 0, (g_i400BodyMesh.length + g_i400HatchMesh.length + g_i400PropMesh.length + g_planeMesh.length +
        g_uboatMesh.length + g_torpMesh.length + g_explMesh.length + g_seaMesh.length + g_islandMesh.length) * FLOAT_SIZE)) {
        return -1
    }

    // Get references to GLSL uniforms
    g_u_model_ref = gl.getUniformLocation(gl.program, 'u_Model')
    g_u_camera_ref = gl.getUniformLocation(gl.program, 'u_Camera')
    g_u_projection_ref = gl.getUniformLocation(gl.program, 'u_Projection')

    // Reposition our mesh
    g_i400Matrix = new Matrix4().setScale(0.015625, 0.015625, 0.015625)
    g_leftPropMatrix = new Matrix4().setTranslate(54.25, -4.7443, 2.2903)
    g_rightPropMatrix = new Matrix4().setTranslate(54.25, -4.7443, -2.2902)
    g_planeMatrix = new Matrix4()
    g_uboatMatrix = new Matrix4().setTranslate(-UBOAT_DIST, 0, 0).scale(0.03125, 0.03125, 0.03125)
    g_torpMatrix = new Matrix4().setTranslate(-0.9, -0.04, 0).scale(0.0625, 0.0625, 0.0625)
    g_explMatrix = new Matrix4().setTranslate(-UBOAT_DIST + 0.5, 0, 0).scale(0.1, 0.1, 0.1)

    g_cameraMatrix = new Matrix4().setLookAt(0, 1, 0, 0, 0, 0, 0, 1, 0)

    // Setup a reasonable "basic" perspective projection
    g_projectionMatrix = new Matrix4().setPerspective(90, 1.6, 0.1, 1000)

    // Initially place the camera in "front" and above the submarine a bit
    g_cameraDistance = 1.5
    g_cameraAngle = -90
    g_cameraHeight = .2

    // Initialize control values
    g_movingUp = false
    g_movingDown = false
    g_movingLeft = false
    g_movingRight = false
    g_movingForward = false
    g_movingBackward = false

    // Enable culling and depth tests
    gl.enable(gl.CULL_FACE)
    gl.enable(gl.DEPTH_TEST)

    // Setup for ticks
    g_lastFrameMS = Date.now()

    g_isTargeting = false

    tick()
}

// extra constants for cleanliness
const CAMERA_SPEED_XZ = .01
const CAMERA_SPEED_Y = .001
const CAMERA_ROT_SPEED = .1
const ROTATION_SPEED = 1
const PLANE_SPEED = 0.125
const SUB_SPEED = 0.001
const TORP_SPEED = 0.001

var g_planeLaunched = false
var g_torpFired = false
function launchPlane() {
    g_planeLaunched = true
    document.getElementById("plane").disabled = true
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
    g_planeLaunched = false
    g_planeMatrix.setIdentity()
    g_torpFired = false
    g_distance_torp = 0
    g_torpMatrix.setTranslate(-0.9, -0.04, 0).scale(0.0625, 0.0625, 0.0625)
    g_hit = false
    g_explScale = 0
    g_explMatrix.setTranslate(-UBOAT_DIST + 0.5, 0, 0).scale(0.1, 0.1, 0.1)
    document.getElementById("plane").disabled = false
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

    updateCameraPosition(deltaTime)

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

// The y-offset of the map for rendering
const MAP_Y_OFFSET = -0.125

// draw to the screen on the next frame
function draw() {
    var cameraMatrix = calculateCameraPosition()

    // Update with our global transformation matrices
    gl.uniformMatrix4fv(g_u_model_ref, false, g_i400Matrix.elements)
    gl.uniformMatrix4fv(g_u_camera_ref, false, cameraMatrix.elements)
    gl.uniformMatrix4fv(g_u_projection_ref, false, g_projectionMatrix.elements)

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

    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4().scale(0.25, 0.25, 0.25).translate(g_distance_sub - 500, MAP_Y_OFFSET, -500).elements)
    first += count
    count = g_seaMesh.length / 3
    gl.drawArrays(gl.TRIANGLES, first, count)

    gl.uniformMatrix4fv(g_u_model_ref, false, new Matrix4().translate(-10, MAP_Y_OFFSET + 1, 0).elements)
    first += count
    count = g_islandMesh.length / 3
    gl.drawArrays(gl.TRIANGLES, first, count)
}

/*
 * Helper function to update the camera position each frame
 */
function updateCameraPosition(deltaTime) {
    // move the camera based on user input
    if (g_movingUp) {
        g_cameraHeight += CAMERA_SPEED_Y * deltaTime
    }
    if (g_movingDown) {
        g_cameraHeight -= CAMERA_SPEED_Y * deltaTime
    }
    if (g_movingLeft) {
        g_cameraAngle += CAMERA_ROT_SPEED * deltaTime
    }
    if (g_movingRight) {
        g_cameraAngle -= CAMERA_ROT_SPEED * deltaTime
    }
    if (g_movingForward) {
        // note that moving "forward" means "towards the teapot"
        g_cameraDistance -= CAMERA_SPEED_XZ * deltaTime
        // we don't want to hit a distance of 0
        g_cameraDistance = Math.max(g_cameraDistance, 0.5)
    }
    if (g_movingBackward) {
        g_cameraDistance += CAMERA_SPEED_XZ * deltaTime
    }
}

/*
 * Helper function to calculate camera position from the properties we update
 * Taken from the lecture 16 demos
 */
function calculateCameraPosition() {
    // Calculate the camera position from our angle and height
    // we get to use a bit of clever 2D rotation math
    // note that we can only do this because we're "fixing" our plane of motion
    // if we wanted to allow arbitrary rotation, we would want quaternions!
    var cameraPosition = new Vector3()
    cameraPosition.x = Math.cos(Math.PI * g_cameraAngle / 180)
    cameraPosition.y = g_cameraHeight
    cameraPosition.z = Math.sin(Math.PI * g_cameraAngle / 180)
    cameraPosition.normalize()

    // calculate distance and turn into an array for matrix entry
    var cameraPositionArray = [
        cameraPosition.x * g_cameraDistance,
        cameraPosition.y * g_cameraDistance,
        cameraPosition.z * g_cameraDistance
    ]

    // Build a new lookat matrix each frame
    return new Matrix4().setLookAt(...cameraPositionArray, 0, 0, 0, 0, 1, 0)
}

/*
 * Helper function to setup camera movement key binding logic
 * Taken from lecture 16 demos
 */
function setupKeyBinds() {
    // Start movement when the key starts being pressed
    document.addEventListener('keydown', function (event) {
        if (event.key == 'r') {
            g_movingUp = true
        }
        else if (event.key == 'f') {
            g_movingDown = true
        }
        else if (event.key == 'a') {
            g_movingLeft = true
        }
        else if (event.key == 'd') {
            g_movingRight = true
        }
        else if (event.key == 'w') {
            g_movingForward = true
        }
        else if (event.key == 's') {
            g_movingBackward = true
        }
    })

    // End movement on key release
    document.addEventListener('keyup', function (event) {
        if (event.key == 'r') {
            g_movingUp = false
        }
        else if (event.key == 'f') {
            g_movingDown = false
        }
        else if (event.key == 'a') {
            g_movingLeft = false
        }
        else if (event.key == 'd') {
            g_movingRight = false
        }
        else if (event.key == 'w') {
            g_movingForward = false
        }
        else if (event.key == 's') {
            g_movingBackward = false
        }
    })
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

function buildSeaColors(terrain, height) {
    var colors = []
    for (var i = 0; i < terrain.length; i++) {
        // calculates the vertex color for each vertex independent of the triangle
        // the rasterizer can help make this look "smooth"

        // we use the y axis of each vertex alone for color
        // higher "peaks" have more shade
        var shade = (terrain[i][1] / height - 0.25) * 3 + 0.25
        var color = [shade, shade, 1.0]

        // give each triangle 3 colors
        colors.push(...color)
    }

    return colors
}

function buildIslandColors(terrain, height) {
    var colors = []
    for (var i = 0; i < terrain.length; i++) {
        // calculates the vertex color for each vertex independent of the triangle
        // the rasterizer can help make this look "smooth"

        // we use the y axis of each vertex alone for color
        // higher "peaks" have more shade
        var shade = (terrain[i][1] / height + 0.5) / 2
        var color = [0.3, shade, 0]

        // give each triangle 3 colors
        colors.push(...color)
    }

    return colors
}

function fixIsland(terrain, width, depth) {
    for (var i = 0; i < terrain.length; i++) {
        if (terrain[i][0] < 0.1 * width || terrain[i][0] > 0.9 * width || terrain[i][2] < 0.1 * depth || terrain[i][2] > 0.9 * depth) {
            terrain[i][1] = -10
        }
    }
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