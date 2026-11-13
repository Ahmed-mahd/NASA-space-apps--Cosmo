// Bakes the MakeHuman base mesh (CC0) into a compact binary for the hologram body.
// Usage: node scripts/bake-body.mjs <dir with base.obj and *.target>
//   -> public/models/body.bin  (Float32 positions, then Uint16 triangle indices)
//   -> public/models/body.json (counts, landmarks, license)
// Keeps only the "body" group (drops eyes, teeth, lashes, joints, helper clothes),
// applies the young-male shape (three race targets at 1/3 each, MakeHuman's default
// blend) plus 50% of the max-muscle target, then puts the feet at y = 0 and scales
// the figure to 3.4 units tall.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const dir = resolve(process.argv[2] ?? "data/makehuman");
const lines = readFileSync(join(dir, "base.obj"), "utf8").split(/\r?\n/);

const verts = [];
const faces = [];
let group = "";
for (const l of lines) {
  if (l.startsWith("v ")) { const [, x, y, z] = l.split(/\s+/); verts.push([+x, +y, +z]); }
  else if (l.startsWith("g ")) group = l.slice(2).trim();
  else if (l.startsWith("f ") && group === "body") {
    faces.push(l.slice(2).trim().split(/\s+/).map((t) => parseInt(t.split("/")[0], 10) - 1));
  }
}

function apply(name, w) {
  const t = readFileSync(join(dir, `${name}.target`), "utf8").split(/\r?\n/);
  let n = 0;
  for (const l of t) {
    if (!l || l.startsWith("#")) continue;
    const [i, dx, dy, dz] = l.trim().split(/\s+/).map(Number);
    verts[i][0] += w * dx; verts[i][1] += w * dy; verts[i][2] += w * dz; n++;
  }
  return n;
}
for (const race of ["caucasian", "african", "asian"]) apply(`${race}-male-young`, 1 / 3);
apply("universal-male-young-maxmuscle-averageweight", 0.5);

// keep only vertices used by the body, triangulate quads
const map = new Map();
const pos = [];
const idx = [];
const use = (i) => {
  if (!map.has(i)) { map.set(i, pos.length / 3); pos.push(...verts[i]); }
  return map.get(i);
};
for (const f of faces) {
  const v = f.map(use);
  for (let k = 1; k + 1 < v.length; k++) idx.push(v[0], v[k], v[k + 1]);
}

// normalise: feet on y = 0, 3.4 tall, centred in x/z
let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < pos.length; i += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], pos[i + a]); max[a] = Math.max(max[a], pos[i + a]); }
const s = 3.4 / (max[1] - min[1]);
const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
for (let i = 0; i < pos.length; i += 3) {
  pos[i] = (pos[i] - cx) * s; pos[i + 1] = (pos[i + 1] - min[1]) * s; pos[i + 2] = (pos[i + 2] - cz) * s;
}

// centre the torso (not the feet) on z = 0
{
  let zf = -Infinity, zb = Infinity;
  for (let i = 0; i < pos.length; i += 3) if (Math.abs(pos[i + 1] - 2.5) < 0.05 && Math.abs(pos[i]) < 0.3) { zf = Math.max(zf, pos[i + 2]); zb = Math.min(zb, pos[i + 2]); }
  const dz = (zf + zb) / 2;
  for (let i = 0; i < pos.length; i += 3) pos[i + 2] -= dz;
}

// lower the arms from MakeHuman's A-pose toward a relaxed stance (like the reference render):
// rotate everything outside the shoulder around the shoulder pivot, blended in over the deltoid
{
  const SHOULDER = { x: 0.36, y: 2.74 }, EXTRA = (24 * Math.PI) / 180;
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], y = pos[i + 1], side = Math.sign(x), ax = Math.abs(x);
    const w = smooth(0.3, 0.5, ax) * smooth(2.0, 2.3, y + (ax - 0.3) * 1.6);
    if (w <= 0) continue;
    const a = -EXTRA * w, dx = ax - SHOULDER.x, dy = y - SHOULDER.y;
    const nx = dx * Math.cos(a) - dy * Math.sin(a), ny = dx * Math.sin(a) + dy * Math.cos(a);
    pos[i] = side * (SHOULDER.x + nx); pos[i + 1] = SHOULDER.y + ny;
  }
}

// landmarks to place organs and markers (widest point per height band)
const band = (y0, y1) => {
  let w = 0, zf = -Infinity, zb = Infinity;
  for (let i = 0; i < pos.length; i += 3) {
    const y = pos[i + 1];
    if (y >= y0 && y < y1 && Math.abs(pos[i]) < 0.4) { w = Math.max(w, Math.abs(pos[i])); zf = Math.max(zf, pos[i + 2]); zb = Math.min(zb, pos[i + 2]); }
  }
  return { halfWidth: +w.toFixed(3), front: +zf.toFixed(3), back: +zb.toFixed(3) };
};
const landmarks = {};
for (const y of [3.3, 3.1, 2.9, 2.7, 2.5, 2.3, 2.1, 1.9, 1.7, 1.5, 1.0, 0.5]) landmarks[y] = band(y - 0.05, y + 0.05);
let armX = 0, handY = 0; for (let i = 0; i < pos.length; i += 3) if (Math.abs(pos[i]) > armX) { armX = Math.abs(pos[i]); handY = pos[i + 1]; }
console.log("outermost hand point y", handY.toFixed(2));

const P = new Float32Array(pos), I = new Uint16Array(idx);
if (pos.length / 3 > 65535) throw new Error("too many vertices for Uint16 indices");
const buf = Buffer.concat([Buffer.from(P.buffer), Buffer.from(I.buffer)]);
writeFileSync("public/models/body.bin", buf);
const meta = {
  vertexCount: pos.length / 3, indexCount: idx.length, armSpanHalf: +armX.toFixed(3), landmarks,
  source: "MakeHuman base mesh hm08 with young-male and muscle targets (makehumancommunity/makehuman on GitHub)",
  license: "CC0 1.0 (MakeHuman assets, released September 2020)",
};
writeFileSync("public/models/body.json", JSON.stringify(meta, null, 1));
console.log(`vertices ${meta.vertexCount}, triangles ${idx.length / 3}, ${(buf.length / 1024).toFixed(0)} KB, half arm span ${armX.toFixed(2)}`);
console.log(JSON.stringify(landmarks));
