uniform mat4 u_Model;
uniform mat4 u_Camera;
uniform mat4 u_Projection;

uniform bool u_DrawSkybox;

attribute vec3 a_Position;
attribute vec3 a_Color;
attribute vec3 a_Normal;
attribute vec2 a_TexCoord;

varying vec3 v_Position;
varying vec3 v_Color;
varying vec3 v_Normal;
varying vec2 v_TexCoord;

void main() {
    if(u_DrawSkybox) {
        gl_Position = vec4(a_Position.xy, 0.99999, 1.0);
    } else {
        gl_Position = u_Projection * u_Camera * u_Model * vec4(a_Position, 1.0);
        v_Normal = a_Normal;
    }

    v_Position = a_Position;
    v_Color = a_Color;
    v_TexCoord = a_TexCoord;
}
