"""Builds every Repo Isles model and exports them as one glTF kit.

    blender -b --factory-startup --python art/blender/build_kit.py -- \
        --out public/models/kit.glb [--previews art/previews]

Each model is a top-level node named after its role (hq, tower_ci, ...).
"""

import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import models_buildings  # noqa: E402
import models_towers  # noqa: E402
import models_nature  # noqa: E402


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    options = {"--out": "public/models/kit.glb", "--previews": None}
    for key, value in zip(argv[::2], argv[1::2]):
        options[key] = value
    return options


def build_all():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return [
        models_buildings.town_hall(),
        models_towers.ci_tower(),
        models_towers.ci_tower_foundation(),
        models_towers.ci_tower_building(),
        models_towers.ci_tower_broken(),
        models_towers.release_tower(),
        models_towers.release_tower_foundation(),
        models_towers.release_tower_building(),
        models_towers.release_tower_broken(),
        models_nature.plaza(),
        models_nature.nursery(),
        models_nature.creature(),
        models_nature.egg(),
        models_nature.pine(),
        models_nature.round_tree(),
        models_nature.birch(),
        *models_nature.rocks(),
    ]


def export(models, path):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for obj in models:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.abspath(path),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_yup=True,
    )
    triangles = {obj.name: sum(len(p.vertices) - 2 for p in obj.data.polygons) for obj in models}
    print("KIT", os.path.abspath(path), os.path.getsize(path), "bytes")
    for name, count in triangles.items():
        print(f"  {name:14s} {count:6d} tris")


def render_previews(models, folder):
    os.makedirs(folder, exist_ok=True)
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.render.resolution_x = 640
    scene.render.resolution_y = 640
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("Sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.72, 0.9, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
    scene.world = world

    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), math.radians(10), math.radians(35))
    scene.collection.objects.link(sun)

    ground = bpy.data.meshes.new("Ground")
    ground.from_pydata([(-20, -20, 0), (20, -20, 0), (20, 20, 0), (-20, 20, 0)], [], [(0, 1, 2, 3)])
    ground_obj = bpy.data.objects.new("Ground", ground)
    grass = bpy.data.materials.new("Grass")
    grass.use_nodes = True
    grass.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.2, 0.45, 0.15, 1)
    ground.materials.append(grass)
    scene.collection.objects.link(ground_obj)

    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    camera.data.type = "ORTHO"
    scene.collection.objects.link(camera)
    scene.camera = camera

    for obj in models:
        for other in models:
            other.hide_render = other is not obj
        corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        centre = sum(corners, Vector()) / 8
        size = max((max(c[i] for c in corners) - min(c[i] for c in corners)) for i in range(3))
        # The game camera: from +X / -Y (three's +X / +Z), about 39 degrees down.
        direction = Vector((1, -1, 1.15)).normalized()
        camera.location = centre + direction * (size * 4 + 5)
        camera.rotation_euler = (-direction).to_track_quat("-Z", "Y").to_euler()
        camera.data.ortho_scale = size * 1.45
        scene.render.filepath = os.path.join(folder, f"{obj.name}.png")
        bpy.ops.render.render(write_still=True)
    print("PREVIEWS", folder)


def main():
    options = arguments()
    models = build_all()
    export(models, options["--out"])
    if options["--previews"]:
        render_previews(models, options["--previews"])


main()
