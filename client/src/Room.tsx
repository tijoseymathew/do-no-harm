import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { ScenarioSnapshot } from "../../shared/contracts/scenario.js";

export const stations = [
  "Patient",
  "Monitor",
  "Medication",
  "Oxygen / IV",
  "ECG / results",
  "Clipboard",
  "Call station",
] as const;
export type Station = (typeof stations)[number];
const positions: Record<Station, [number, number, number]> = {
  Patient: [0, 1.2, 0],
  Monitor: [-1.6, 2, -1.5],
  Medication: [-2, 0.9, 2],
  "Oxygen / IV": [-2.7, 1.8, -1],
  "ECG / results": [2.3, 1.2, 0.8],
  Clipboard: [1, 1, 2.3],
  "Call station": [3.5, 1.6, -2.7],
};

export function Room({
  selected,
  select,
  state,
  reduced,
  paused,
}: {
  selected: Station;
  select: (s: Station) => void;
  state: ScenarioSnapshot;
  reduced: boolean;
  paused: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef({ selected, state, reduced, paused });
  current.current = { selected, state, reduced, paused };
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    const element = host.current!;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFallback(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    element.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#172a35");
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(7.6, 6.8, 10.5);
    const target = new THREE.Vector3(0, 1, 0);
    scene.add(new THREE.HemisphereLight(0xd5f0ff, 0x33424c, 2.6));
    const lamp = new THREE.DirectionalLight(0xffe2bc, 4);
    lamp.position.set(0, 7, 3);
    lamp.castShadow = true;
    scene.add(lamp);
    const hits: THREE.Object3D[] = [];
    function box(
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
      color: string,
      station?: Station,
    ) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(w, h, d),
        new THREE.MeshStandardMaterial({ color, roughness: 0.65 }),
      );
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      if (station) {
        mesh.userData.station = station;
        hits.push(mesh);
      }
      return mesh;
    }
    function sphere(
      x: number,
      y: number,
      z: number,
      sx: number,
      sy: number,
      sz: number,
      color: string,
    ) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 16),
        new THREE.MeshStandardMaterial({ color }),
      );
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.userData.station = "Patient";
      scene.add(m);
      hits.push(m);
      return m;
    }
    box(0, -0.1, 0, 9, 0.2, 8, "#526876");
    box(0, 1.8, -3.5, 9, 3.8, 0.18, "#84979d");
    box(-4.4, 1.8, 0, 0.18, 3.8, 7, "#647d88");
    box(0, 1.05, -3.37, 8.8, 0.12, 0.1, "#bdd3cf");
    box(2.9, 1.5, -3.33, 1.4, 3, 0.15, "#304854");
    box(3.35, 1.3, -3.2, 0.06, 0.3, 0.08, "#cce2dd");
    box(0, 0.6, 0, 1.6, 0.3, 3.6, "#bdc8c6", "Patient");
    box(0, 0.9, 0, 1.65, 0.3, 3.6, "#e0e8df", "Patient");
    box(0, 1.13, -1.15, 1.25, 0.2, 0.65, "#f4f0e1", "Patient");
    const chest = sphere(0, 1.26, -0.25, 0.54, 0.26, 0.75, "#7eaaaa");
    sphere(0, 1.36, -1.25, 0.25, 0.29, 0.27, "#b8856b");
    box(0, 1.18, 0.85, 1.22, 0.28, 1.65, "#4d7e8e", "Patient");
    sphere(-0.62, 1.2, -0.2, 0.12, 0.12, 0.65, "#b8856b");
    sphere(0.62, 1.2, -0.2, 0.12, 0.12, 0.65, "#b8856b");
    for (const x of [-0.86, 0.86]) {
      box(x, 1.27, 0.25, 0.07, 0.09, 2.1, "#d8e5e3", "Patient");
      for (const z of [-1.2, 1.2]) box(x, 0.3, z, 0.1, 0.5, 0.1, "#a8babc");
    }
    box(-1.6, 1, -1.5, 0.09, 1.7, 0.09, "#a1b7bb", "Monitor");
    box(-1.6, 2, -1.5, 1.1, 0.8, 0.25, "#c1d4d2", "Monitor");
    const screen = box(-1.6, 2, -1.35, 0.93, 0.61, 0.03, "#13232c", "Monitor");
    const lead = box(-0.7, 1.52, -0.8, 0.025, 0.025, 1.3, "#72e9b1", "Monitor");
    const probe = box(0.63, 1.27, 0.32, 0.19, 0.12, 0.16, "#71d9ef", "Monitor");
    const cuff = box(-0.63, 1.22, -0.5, 0.25, 0.24, 0.25, "#374c65", "Monitor");
    box(-2, 0.7, 2, 1.25, 1.1, 0.65, "#789da2", "Medication");
    const tray = box(-2, 1.3, 2, 1.4, 0.12, 0.8, "#cfddd8", "Medication");
    for (const y of [0.42, 0.7, 0.98])
      box(-2, y, 2.34, 1.05, 0.035, 0.04, "#263e48", "Medication");
    box(-2.4, 1.44, 2, 0.2, 0.2, 0.22, "#f0d5a3", "Medication");
    box(-3, 1.8, -3.1, 0.65, 0.55, 0.25, "#c8d4cd", "Oxygen / IV");
    box(-2.65, 1.3, -0.8, 0.05, 2.6, 0.05, "#bdcecc", "Oxygen / IV");
    box(-2.65, 2.6, -0.8, 0.65, 0.06, 0.06, "#bdcecc", "Oxygen / IV");
    box(-2.4, 2.28, -0.8, 0.22, 0.4, 0.13, "#b0d9d7", "Oxygen / IV");
    box(-3.8, 1.9, -3.1, 0.35, 0.6, 0.22, "#647479");
    box(2.3, 0.75, 0.8, 1.4, 1.3, 0.8, "#72919c", "ECG / results");
    box(2.3, 1.5, 0.8, 0.9, 0.2, 0.6, "#d3ddd5", "ECG / results");
    box(2.3, 1.8, 0.7, 0.8, 0.5, 0.08, "#172e3d", "ECG / results");
    box(1, 1, 2.3, 0.55, 0.07, 0.7, "#d5bd8b", "Clipboard");
    box(1, 1.05, 2.3, 0.44, 0.02, 0.55, "#f1eee1", "Clipboard");
    box(3.8, 1.65, -3.15, 0.35, 0.55, 0.18, "#c9a477", "Call station");
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.48, 48),
      new THREE.MeshBasicMaterial({ color: "#8ce6cf", side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    scene.add(ring);
    const ray = new THREE.Raycaster();
    function pick(event: PointerEvent) {
      const rect = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(
        new THREE.Vector2(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          (-(event.clientY - rect.top) / rect.height) * 2 + 1,
        ),
        camera,
      );
      return ray.intersectObjects(hits)[0]?.object.userData.station as
        | Station
        | undefined;
    }
    const click = (e: PointerEvent) => {
      const station = pick(e);
      if (station) select(station);
    };
    const hover = (e: PointerEvent) => {
      const station = pick(e);
      renderer.domElement.style.cursor = station ? "pointer" : "default";
      for (const hit of hits) {
        const material = (
          hit as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>
        ).material;
        material.emissive.set(
          hit.userData.station === station ? "#204438" : "#000000",
        );
      }
    };
    const lost = (e: Event) => {
      e.preventDefault();
      setFallback(true);
    };
    renderer.domElement.addEventListener("pointerup", click);
    renderer.domElement.addEventListener("pointermove", hover);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    const resize = new ResizeObserver(() => {
      renderer.setSize(element.clientWidth, element.clientHeight);
      camera.aspect = element.clientWidth / element.clientHeight;
      camera.updateProjectionMatrix();
    });
    resize.observe(element);
    let frame = 0;
    let breathingTime = 0;
    let previousTime = 0;
    function draw(time: number) {
      const c = current.current;
      const p = positions[c.selected];
      const next = new THREE.Vector3(p[0] * 0.18, 1, p[2] * 0.18);
      if (c.reduced) target.copy(next);
      else target.lerp(next, 0.06);
      camera.lookAt(target);
      ring.position.set(p[0], 0.025, p[2]);
      lead.visible = c.state.sensors.ecg;
      probe.visible = c.state.sensors.spo2;
      cuff.visible = c.state.sensors.cuff;
      screen.material.color.set(c.state.sensors.ecg ? "#205344" : "#13232c");
      tray.material.color.set(c.state.receipts.length ? "#75c7a0" : "#cfddd8");
      if (!c.paused) breathingTime += Math.min(time - previousTime, 100);
      previousTime = time;
      chest.scale.y =
        0.26 +
        (c.reduced
          ? 0
          : Math.sin(
              ((breathingTime / 1000) * 2 * Math.PI * c.state.measurements.rr) /
                60,
            ) * 0.008);
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      renderer.domElement.removeEventListener("pointerup", click);
      renderer.domElement.removeEventListener("pointermove", hover);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [select]);
  return (
    <div
      className="room"
      ref={host}
      role="region"
      aria-label="Emergency bay 3D view"
    >
      <div className="room-label">
        <span className="eyebrow">EMERGENCY DEPARTMENT</span>
        <h2>
          Bay 01 <span>/ {selected}</span>
        </h2>
      </div>
      {fallback && (
        <div className="graphics-fallback" role="status">
          Reduced graphics — WebGL unavailable. All bedside controls remain
          available below.
        </div>
      )}
      <div className="room-legend">
        Fixed camera · Select equipment or use bedside controls
        <br />
        Oxygen station available · suction unavailable · IV{" "}
        {state.devices.ivAccess.established ? "established" : "not connected"}
      </div>
    </div>
  );
}
