uniform mat4 u_Model;
uniform mat4 u_Camera;
uniform mat4 u_Projection;

uniform bool u_DrawSkybox;
uniform bool u_DrawOcean;

attribute vec3 a_Position;
attribute vec3 a_Color;
attribute vec3 a_Normal;
attribute vec2 a_TexCoord;

varying vec3 v_Position;
varying vec3 v_Color;
varying vec3 v_Normal;
varying vec2 v_TexCoord;

uniform float u_Time;

void main() {
    if(u_DrawSkybox) {
        gl_Position = vec4(a_Position.xy, 0.99999, 1.0);
    } else if (u_DrawOcean) {
        vec4 worldPos = u_Model * vec4(a_Position, 1.0);
        worldPos.y = sin(worldPos.z + u_Time) + sin((worldPos.x + u_Time) * 2.0) * 0.5;
        vec3 normal = normalize(vec3(0.0, 10.0, -cos(worldPos.z + u_Time)));
        v_Normal = normal;
        gl_Position = u_Projection * u_Camera * worldPos;
    } 
    else {
        gl_Position = u_Projection * u_Camera * u_Model * vec4(a_Position, 1.0);
        v_Normal = a_Normal;
    }

    v_Position = a_Position;
    v_Color = a_Color;
    v_TexCoord = a_TexCoord;
}
