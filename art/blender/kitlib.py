"""Small modelling toolkit on top of bmesh for the Repo Isles model kit.

Every model is built from code so it can be reviewed, tweaked and rebuilt.
Conventions: metres = world units, Z up, models stand on z = 0 and face -Y
(which glTF export turns into +Z, towards the game camera).
"""

import math
import random

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# sRGB hex colours. Names in RECOLOURED are swapped at runtime by the renderer.
PALETTE = {
    "Stone": ("#a3a2ab", 0.9, 0.0),
    "StoneDark": ("#72727f", 0.95, 0.0),
    "StoneLight": ("#c8c2b6", 0.9, 0.0),
    "Plaster": ("#f2e6cc", 0.95, 0.0),
    "Timber": ("#5b3a26", 0.85, 0.0),
    "Wood": ("#94603a", 0.8, 0.0),
    "WoodDark": ("#6b4329", 0.85, 0.0),
    "Roof": ("#46536f", 0.8, 0.0),
    "RoofLight": ("#5a6888", 0.8, 0.0),
    "RoofUnder": ("#3a2b22", 0.9, 0.0),
    "Metal": ("#3d424c", 0.45, 0.6),
    "Brass": ("#b8893a", 0.4, 0.7),
    "Shutter": ("#3f7d5c", 0.8, 0.0),
    "Flower": ("#e8505b", 0.8, 0.0),
    "FlowerYellow": ("#f4c542", 0.8, 0.0),
    "Leaf": ("#4f9a4a", 0.85, 0.0),
    "LeafLight": ("#7cbc5c", 0.85, 0.0),
    "LeafBirch": ("#a8cc5a", 0.85, 0.0),
    "Pine": ("#2f7a4f", 0.85, 0.0),
    "PineDark": ("#245f3f", 0.85, 0.0),
    "Bark": ("#6a4a33", 0.9, 0.0),
    "Birch": ("#ece7dc", 0.85, 0.0),
    "Dark": ("#2b2b30", 0.9, 0.0),
    "Moss": ("#6c9b4b", 0.95, 0.0),
    "Paving": ("#8f8c87", 0.95, 0.0),
    "PavingLight": ("#aca79d", 0.95, 0.0),
    "PavingDark": ("#6e6b67", 0.95, 0.0),
    "Hay": ("#dcbd6a", 0.95, 0.0),
    "Straw": ("#c39a4c", 0.95, 0.0),
    "Belly": ("#fff4e3", 0.7, 0.0),
    "EyeWhite": ("#ffffff", 0.3, 0.0),
    "Pupil": ("#1d1f2b", 0.3, 0.0),
    "Cheek": ("#ff9aa8", 0.7, 0.0),
    "Speckle": ("#8a6a46", 0.9, 0.0),
    "Flag": ("#2bb3a0", 0.8, 0.0),
    "Cloth": ("#d9cfb8", 0.9, 0.0),
    # Recoloured at runtime (default colours shown in the previews):
    "Accent": ("#3f9ad6", 0.7, 0.0),  # district health
    "Body": ("#7fd3ff", 0.55, 0.0),  # pull request mood
}
EMISSIVE = {
    "Glass": ("#ffd98a", 1.4),
    "Lamp": ("#ffe2a0", 2.5),
    "Beacon": ("#57d68d", 2.0),  # pipeline status, recoloured at runtime
}


def srgb_to_linear(channel):
    return channel / 12.92 if channel <= 0.04045 else ((channel + 0.055) / 1.055) ** 2.4


def rgba(hex_colour):
    value = hex_colour.lstrip("#")
    return tuple(srgb_to_linear(int(value[i : i + 2], 16) / 255) for i in (0, 2, 4)) + (1.0,)


_materials = {}


def material(name):
    if name in _materials:
        return _materials[name]
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    if name in EMISSIVE:
        colour, strength = EMISSIVE[name]
        bsdf.inputs["Base Color"].default_value = rgba(colour)
        bsdf.inputs["Emission Color"].default_value = rgba(colour)
        bsdf.inputs["Emission Strength"].default_value = strength
        bsdf.inputs["Roughness"].default_value = 0.3
    else:
        colour, roughness, metallic = PALETTE[name]
        bsdf.inputs["Base Color"].default_value = rgba(colour)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    _materials[name] = mat
    return mat


def transform(loc=(0, 0, 0), rot=(0, 0, 0), scale=(1, 1, 1)):
    return (
        Matrix.Translation(Vector(loc))
        @ Euler(rot, "XYZ").to_matrix().to_4x4()
        @ Matrix.Diagonal(Vector((*scale, 1.0)))
    )


class Model:
    """Accumulates primitives into one bmesh with per-face materials."""

    def __init__(self, name, seed):
        self.name = name
        self.bm = bmesh.new()
        self.materials = []
        self.rng = random.Random(seed)

    def _index(self, mat):
        if mat not in self.materials:
            self.materials.append(mat)
        return self.materials.index(mat)

    def _finish_part(self, verts, mat, bevel=0.0, smooth=False, jitter=0.0):
        faces = list(dict.fromkeys(face for vert in verts for face in vert.link_faces))
        index = self._index(mat)
        for face in faces:
            face.material_index = index
            face.smooth = smooth
        if jitter:
            for vert in verts:
                vert.co += Vector(
                    (self.rng.uniform(-jitter, jitter), self.rng.uniform(-jitter, jitter), self.rng.uniform(-jitter, jitter))
                )
        if bevel:
            edges = list(dict.fromkeys(edge for vert in verts for edge in vert.link_edges))
            bmesh.ops.bevel(
                self.bm,
                geom=edges,
                offset=bevel,
                offset_type="OFFSET",
                segments=1,
                profile=0.5,
                affect="EDGES",
                clamp_overlap=True,
            )
        return verts

    # --- primitives -------------------------------------------------------

    def box(self, size, loc, mat, rot=(0, 0, 0), bevel=0.0, jitter=0.0):
        result = bmesh.ops.create_cube(self.bm, size=1.0, matrix=transform(loc, rot, size))
        return self._finish_part(result["verts"], mat, bevel=bevel, jitter=jitter)

    def cylinder(self, r1, r2, height, loc, mat, segments=8, rot=(0, 0, 0), bevel=0.0, jitter=0.0, smooth=False):
        """Base centred on `loc` (before rotation), extending along local +Z."""
        matrix = transform(loc, rot) @ Matrix.Translation((0, 0, height / 2))
        result = bmesh.ops.create_cone(
            self.bm,
            cap_ends=True,
            cap_tris=False,
            segments=segments,
            radius1=r1,
            radius2=max(r2, 0.0),
            depth=height,
            matrix=matrix,
        )
        verts = result["verts"]
        if r2 <= 0.0:
            bmesh.ops.remove_doubles(self.bm, verts=verts, dist=1e-5)
            verts = [v for v in verts if v.is_valid]
        return self._finish_part(verts, mat, bevel=bevel, jitter=jitter, smooth=smooth)

    def ico(self, radius, loc, mat, subdivisions=1, scale=(1, 1, 1), rot=(0, 0, 0), jitter=0.0, smooth=False):
        result = bmesh.ops.create_icosphere(
            self.bm, subdivisions=subdivisions, radius=radius, matrix=transform(loc, rot, scale)
        )
        return self._finish_part(result["verts"], mat, jitter=jitter, smooth=smooth)

    def sphere(self, radius, loc, mat, segments=16, rings=10, scale=(1, 1, 1), rot=(0, 0, 0), smooth=True):
        result = bmesh.ops.create_uvsphere(
            self.bm, u_segments=segments, v_segments=rings, radius=radius, matrix=transform(loc, rot, scale)
        )
        return self._finish_part(result["verts"], mat, smooth=smooth)

    def torus(self, major, minor, loc, mat, segments=16, sides=6, rot=(0, 0, 0), jitter=0.0, arc=math.tau):
        matrix = transform(loc, rot)
        closed = arc >= math.tau - 1e-6
        count = segments if closed else segments + 1
        rings = []
        for i in range(count):
            a = arc * i / segments
            ring = []
            for j in range(sides):
                b = math.tau * j / sides
                p = Vector(((major + minor * math.cos(b)) * math.cos(a), (major + minor * math.cos(b)) * math.sin(a), minor * math.sin(b)))
                ring.append(self.bm.verts.new(matrix @ p))
            rings.append(ring)
        faces = []
        for i in range(segments):
            nxt = rings[(i + 1) % count]
            cur = rings[i]
            for j in range(sides):
                faces.append(self.bm.faces.new((cur[j], nxt[j], nxt[(j + 1) % sides], cur[(j + 1) % sides])))
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        verts = [v for ring in rings for v in ring]
        return self._finish_part(verts, mat, jitter=jitter)

    def prism(self, profile, depth, loc, mat, rot=(0, 0, 0), bevel=0.0):
        """Extrudes a convex XZ profile `depth` along Y, centred on `loc`."""
        matrix = transform(loc, rot)
        front = [self.bm.verts.new(matrix @ Vector((x, -depth / 2, z))) for x, z in profile]
        back = [self.bm.verts.new(matrix @ Vector((x, depth / 2, z))) for x, z in profile]
        faces = [self.bm.faces.new(front), self.bm.faces.new(list(reversed(back)))]
        n = len(profile)
        for i in range(n):
            faces.append(self.bm.faces.new((front[i], front[(i + 1) % n], back[(i + 1) % n], back[i])))
        bmesh.ops.recalc_face_normals(self.bm, faces=faces)
        return self._finish_part(front + back, mat, bevel=bevel)

    # --- output -----------------------------------------------------------

    def build(self):
        mesh = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        for name in self.materials:
            mesh.materials.append(material(name))
        obj = bpy.data.objects.new(self.name, mesh)
        bpy.context.scene.collection.objects.link(obj)
        return obj
