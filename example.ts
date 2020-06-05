import { Merger } from "./mergepass";
import { Brightness } from "./effects/brightness";
import { Blur } from "./effects/blur";
import { Grain } from "./effects/grain";
import { HSBRotate } from "./effects/hsbrotate";
import { HSB } from "./effects/hsb";

const glCanvas = document.getElementById("gl") as HTMLCanvasElement;
const gl = glCanvas.getContext("webgl2");

if (gl === null) {
  throw new Error("problem getting the gl context");
}

const sourceCanvas = document.getElementById("source") as HTMLCanvasElement;
const source = sourceCanvas.getContext("2d");

if (source === null) {
  throw new Error("problem getting the source context");
}

window.addEventListener("load", () => {
  // TODO don't need the mediump float probably
  const brightness = new Brightness(["uBrightness", 0.0]);
  const hsb = new HSB([0, 0.1, 0], [0, 1, 0]);
  // uniforms not being set if they are first pass???
  // if uniform brightness is first, the second non-uniform brightness works fine, and effects things as normal
  const blur = new Blur(["uBlur", [1, 1]]).repeat(3);
  const grain = new Grain(0.1);
  const hueRotate = new HSBRotate(0.1);

  const merger = new Merger([brightness, hsb, blur, grain], sourceCanvas, gl);

  // dwitter sim
  const C = Math.cos;
  const S = Math.sin;

  const x = source;
  const c = sourceCanvas;

  let steps = 0;

  const draw = (time: number) => {
    const t = steps / 60;
    steps++;
    merger.draw();
    brightness.setUniform("uBrightness", 0.3 * Math.cos(time / 2000));
    blur.setUniform("uBlur", [Math.cos(time / 1000) ** 8, 0]);

    // draw insane stripes
    const i = ~~(t * 9);
    const j = ~~(i / 44);
    const k = i % 44;
    x.fillStyle = `hsl(${(k & j) * i},40%,${50 + C(t) * 10}%`;
    x.fillRect(k * 24, 0, 24, k + 2);
    x.drawImage(c, 0, k + 2);

    requestAnimationFrame(draw);
  };

  draw(0);
});
glCanvas.addEventListener("click", () => glCanvas.requestFullscreen());
