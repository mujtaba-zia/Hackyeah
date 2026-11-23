"""Builds every Repo Isles model and exports them as one glTF kit.

    blender -b --factory-startup --python art/blender/build_kit.py -- \
        --out public/models/kit.glb [--previews art/previews]

Each model is a top-level node named after its role (hq, tower_ci, ...). The
build fails if the kit breaks a promise the renderer relies on: see `validate`.
With `--previews` it also renders one PNG per model and `sheet.png` with all of
them, from the game camera's angle.
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
        *models_nature.bushes(),
        *models_nature.flowers(),
        models_buildings.waystation(),
        models_nature.giant(),
    ]


# Materials the renderer swaps by name, and the models that must carry them.
TOWERS = [f"tower_{kind}{stage}" for kind in ("ci", "release") for stage in ("", "_foundation", "_building", "_broken")]
REQUIRED_MATERIALS = {"hq": ["Accent"], "creature": ["Body"], "egg": ["Body"], **{name: ["Beacon", "Status"] for name in TOWERS}}
# The layout leaves each tower this much room; towers stand 2.88 apart.
TOWER_REACH = 2.1
# Boulders, bushes and rubble may sit a little into the ground; nothing may hang far below it.
BURIED = 0.3


def measure(obj):
    """A model's highest point, lowest point and reach from its own centre line."""
    points = [vert.co for vert in obj.data.vertices]
    return max(p.z for p in points), min(p.z for p in points), max(math.hypot(p.x, p.y) for p in points)


def validate(models):
    """Checks what the renderer and the layout assume about the kit; returns the problems found."""
    problems = []
    tops = {}
    for obj in models:
        top, bottom, reach = measure(obj)
        tops[obj.name] = top
        materials = [slot.name for slot in obj.data.materials]
        for name in REQUIRED_MATERIALS.get(obj.name, []):
            if name not in materials:
                problems.append(f"{obj.name} has no {name} material")
        if bottom < -BURIED:
            problems.append(f"{obj.name} reaches {-bottom:.2f} below the ground; {BURIED} is the limit")
        if obj.name in TOWERS and reach > TOWER_REACH:
            problems.append(f"{obj.name} reaches {reach:.2f} from its centre; towers have {TOWER_REACH}")
    # A tower's stage must read from its height alone: foundations low, a broken tower a stump, scaffolding in between.
    for kind in ("ci", "release"):
        built = tops[f"tower_{kind}"]
        for stage, share in (("_building", 1.0), ("_broken", 0.6), ("_foundation", 0.35)):
            if tops[f"tower_{kind}{stage}"] >= built * share:
                problems.append(f"tower_{kind}{stage} is {tops[f'tower_{kind}{stage}']:.2f} tall; it must stay under {built * share:.2f}")
    return problems


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
    print("KIT", os.path.abspath(path), os.path.getsize(path), "bytes")
    for obj in models:
        triangles = sum(len(p.vertices) - 2 for p in obj.data.polygons)
        top, _, reach = measure(obj)
        print(f"  {obj.name:26s} {triangles:6d} tris  {len(obj.data.materials):2d} materials  top {top:5.2f}  reach {reach:5.2f}")


# The game camera: from +X / -Y (three's +X / +Z), about 39 degrees down.
CAMERA_DIRECTION = Vector((1, -1, 1.15)).normalized()


def preview_scene():
    """Lights, ground and camera that stand in for the game: a warm sun from the front left, sky light, grass."""
    scene = bpy.context.scene
    for engine in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT", "BLENDER_WORKBENCH"):
        try:
            scene.render.engine = engine
            break
        except TypeError:
            continue
    scene.view_settings.view_transform = "Standard"
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("Sky")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.62, 0.8, 0.95, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.7
    scene.world = world

    sun = bpy.data.objects.new("Sun", bpy.data.lights.new("Sun", "SUN"))
    sun.data.energy = 3.2
    sun.data.angle = math.radians(4)
    # Shining along (0.35, 0.55, -1): from the viewer's front left, as in the game.
    sun.rotation_euler = Vector((0.35, 0.55, -1)).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(sun)

    ground = bpy.data.meshes.new("Ground")
    ground.from_pydata([(-200, -200, 0), (200, -200, 0), (200, 200, 0), (-200, 200, 0)], [], [(0, 1, 2, 3)])
    grass = bpy.data.materials.new("Grass")
    grass.use_nodes = True
    grass.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.16, 0.46, 0.12, 1)
    grass.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 1
    ground.materials.append(grass)
    scene.collection.objects.link(bpy.data.objects.new("Ground", ground))

    camera = bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera"))
    camera.data.type = "ORTHO"
    camera.rotation_euler = (-CAMERA_DIRECTION).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(camera)
    scene.camera = camera
    return scene, camera


def render(scene, camera, centre, span, path, width, height):
    camera.location = centre + CAMERA_DIRECTION * (span * 4 + 20)
    camera.data.ortho_scale = span
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def render_previews(models, folder):
    os.makedirs(folder, exist_ok=True)
    scene, camera = preview_scene()

    for obj in models:
        for other in models:
            other.hide_render = other is not obj
        top, _, reach = measure(obj)
        render(scene, camera, Vector((0, 0, top / 2)), max(top, reach * 2) * 1.5, os.path.join(folder, f"{obj.name}.png"), 640, 640)

    # The sheet: every model side by side across the camera's view, six to a row.
    across = Vector((1, 1, 0)).normalized()
    towards = Vector((1, -1, 0)).normalized()
    columns, pitch = 6, 7.5
    rows = math.ceil(len(models) / columns)
    for index, obj in enumerate(models):
        obj.hide_render = True
        copy = obj.copy()
        column, row = index % columns, index // columns
        copy.location = across * (column - (columns - 1) / 2) * pitch + towards * (row - (rows - 1) / 2) * pitch * 1.7
        copy.hide_render = False
        scene.collection.objects.link(copy)
    render(scene, camera, Vector((0, 0, 3)), columns * pitch * 1.12, os.path.join(folder, "sheet.png"), 2000, 2000)
    print("PREVIEWS", folder)


def main():
    options = arguments()
    models = build_all()
    problems = validate(models)
    for problem in problems:
        print("INVALID", problem)
    if problems:
        sys.exit(1)
    export(models, options["--out"])
    if options["--previews"]:
        render_previews(models, options["--previews"])


main()
