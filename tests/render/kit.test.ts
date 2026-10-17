import { readFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";
import { KIT_MODELS, kitFromScene } from "../../src/render/kit";

function namedMaterial(name: string): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial();
  material.name = name;
  return material;
}

function sceneWith(models: readonly string[]): THREE.Group {
  const scene = new THREE.Group();
  for (const name of models) {
    const root = new THREE.Group();
    root.name = name;
    root.position.set(10, 0, 0);
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), namedMaterial(name === "hq" ? "Accent" : "Stone"));
    mesh.position.set(0, 2, 0);
    root.add(mesh);
    scene.add(root);
  }
  return scene;
}

describe("model kit", () => {
  it("bakes each model into model space, ignoring where it sits in the file", () => {
    const kit = kitFromScene(sceneWith(KIT_MODELS));
    const [part] = kit.parts("tower_ci");
    part!.geometry.computeBoundingBox();
    const centre = part!.geometry.boundingBox!.getCenter(new THREE.Vector3());
    expect(centre.toArray()).toEqual([0, 2, 0]);
  });

  it("refuses a file that is missing a model", () => {
    expect(() => kitFromScene(sceneWith(KIT_MODELS.filter((name) => name !== "egg")))).toThrow("missing egg");
  });

  it("swaps only the recoloured material and shares everything else", () => {
    const kit = kitFromScene(sceneWith(KIT_MODELS));
    const health = namedMaterial("good");
    const first = kit.create("hq", { Accent: health });
    const second = kit.create("hq");
    const [firstMesh] = first.children as THREE.Mesh[];
    const [secondMesh] = second.children as THREE.Mesh[];
    expect(firstMesh!.material).toBe(health);
    expect(secondMesh!.material).toBe(kit.template("hq", "Accent"));
    expect(firstMesh!.geometry).toBe(secondMesh!.geometry);
  });
});

describe("shipped kit", () => {
  it("contains every model and the materials the renderer recolours", async () => {
    const file = readFileSync(new URL("../../public/models/kit.glb", import.meta.url));
    const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    const gltf = await new GLTFLoader().parseAsync(buffer, "");
    const kit = kitFromScene(gltf.scene);
    expect(kit.template("hq", "Accent").name).toBe("Accent");
    expect(kit.template("tower_ci", "Beacon").name).toBe("Beacon");
    expect(kit.template("tower_release", "Beacon").name).toBe("Beacon");
    expect(kit.template("creature", "Body").name).toBe("Body");
    expect(kit.template("egg", "Body").name).toBe("Body");
  });
});
