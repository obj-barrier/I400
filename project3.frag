precision highp float;

uniform mat4 u_Model;
uniform mat4 u_Camera;
uniform mat4 u_ModelInverseTranspose;
uniform mat4 u_CameraProjectionInverse;

uniform bool u_FlatLighting;
uniform bool u_DrawSkybox;
uniform bool u_DrawSea;

uniform vec3 u_Light;
uniform float u_SpecPower;
uniform sampler2D u_Texture;
uniform samplerCube u_Skybox;

varying vec3 v_Position;
varying vec3 v_Color;
varying vec3 v_Normal;
varying vec2 v_TexCoord;

void main() {
    if (u_FlatLighting) {
        if(u_DrawSkybox) {
            vec3 inversePosition = mat3(u_CameraProjectionInverse) * v_Position;
            gl_FragColor = textureCube(u_Skybox, inversePosition);
        } else {    
            gl_FragColor = vec4(v_Color, 1.0);
        }
    } else {
        // Calculate positions and normals
        vec3 worldPosition = vec3(u_Model * vec4(v_Position, 1.0));
        vec3 worldNormal = normalize(vec3(u_ModelInverseTranspose * vec4(v_Normal, 0.0)));
        vec3 cameraSpacePosition = vec3(u_Camera * vec4(worldPosition, 1.0));

        // Work out the direction from our light to our position
        vec3 lightDir = normalize(u_Light - worldPosition);

        // Calculate our fragment diffuse amount
        float diffuse = max(dot(lightDir, worldNormal), 0.0);

        // Calculate our reflection across the normal and into camera space
        vec3 reflectDir = normalize(reflect(-lightDir, worldNormal));
        vec3 cameraReflectDir = vec3(u_Camera * vec4(reflectDir, 0.0));

        // our camera is at the origin of camera space, so calculate direction from that
        vec3 cameraDir = normalize(-cameraSpacePosition);

        // use the angle to calculate specular
        float angle = max(dot(cameraDir, cameraReflectDir), 0.0);
        float specular = max(pow(angle, u_SpecPower), 0.0);

        float ambient = 0.2;

        // set constant colors for the lights
        vec3 diffuseColor;
        if (u_DrawSea) {
            diffuseColor = vec3(0.4, 0.6, 0.8);
        } else {
            diffuseColor = vec3(texture2D(u_Texture, v_TexCoord));
        }
        vec3 specularColor = vec3(1.0, 1.0, 0.8);

        // add up and save our components
        vec3 color = (ambient + diffuse) * diffuseColor + specular * specularColor;
        gl_FragColor = vec4(color, 1.0);
    }
}
