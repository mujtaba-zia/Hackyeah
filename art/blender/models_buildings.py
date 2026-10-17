"""District headquarters and pipeline towers."""

import math

from kitlib import Model

FRONT = "front"  # faces -Y
SIDE = "side"  # faces +X


def _on_face(face, offset, along, z):
    """World position on a wall: `offset` = wall plane coordinate, `along` = position across the wall."""
    return (along, offset, z) if face == FRONT else (offset, along, z)


def window(m, face, plane, along, z, width=0.42, height=0.52, shutters=True, flower_box=False):
    out = -1 if face == FRONT else 1
    rot = (0, 0, 0) if face == FRONT else (0, 0, math.pi / 2)

    def at(depth, dz=0.0, shift=0.0):
        p = plane + out * depth
        return _on_face(face, p, along + shift, z + dz)

    m.box((width + 0.12, 0.06, height + 0.12), at(0.02), "Timber", rot=rot, bevel=0.01)
    m.box((width, 0.04, height), at(0.04), "Glass", rot=rot)
    m.box((width, 0.03, 0.04), at(0.06), "Timber", rot=rot)
    m.box((0.04, 0.03, height), at(0.06), "Timber", rot=rot)
    m.box((width + 0.2, 0.12, 0.05), at(0.06, -height / 2 - 0.07), "StoneLight", rot=rot, bevel=0.01)
    if shutters:
        for side in (-1, 1):
            m.box((width * 0.42, 0.04, height + 0.06), at(0.04, 0, side * (width / 2 + width * 0.27)), "Shutter", rot=rot, bevel=0.008)
            m.box((width * 0.3, 0.05, 0.03), at(0.05, 0.12, side * (width / 2 + width * 0.27)), "Timber", rot=rot)
            m.box((width * 0.3, 0.05, 0.03), at(0.05, -0.12, side * (width / 2 + width * 0.27)), "Timber", rot=rot)
    if flower_box:
        m.box((width + 0.16, 0.16, 0.12), at(0.1, -height / 2 - 0.16), "Wood", rot=rot, bevel=0.01)
        for i in range(6):
            t = (i / 5 - 0.5) * (width + 0.04)
            colour = "Flower" if i % 2 == 0 else "FlowerYellow"
            m.ico(0.055, at(0.12, -height / 2 - 0.07, t), "Leaf", subdivisions=1, jitter=0.01)
            m.ico(0.035, at(0.16, -height / 2 - 0.03, t + 0.02), colour, subdivisions=1)


def timber_frame(m, x0, x1, y0, y1, z0, z1, posts_front, posts_side, braces=True):
    """Posts, beams and braces on the outside of a plastered storey."""
    t = 0.09
    height = z1 - z0
    for x in (x0, x1):
        for y in (y0, y1):
            m.box((t, t, height), (x, y, (z0 + z1) / 2), "Timber")
    for y in (y0, y1):
        m.box((x1 - x0 + t, t, t), ((x0 + x1) / 2, y, z1 - t / 2), "Timber")
        m.box((x1 - x0 + t, t, t), ((x0 + x1) / 2, y, z0 + t / 2), "Timber")
        for x in posts_front:
            m.box((t * 0.9, t, height), (x, y, (z0 + z1) / 2), "Timber")
    for x in (x0, x1):
        m.box((t, y1 - y0 + t, t), (x, (y0 + y1) / 2, z1 - t / 2), "Timber")
        m.box((t, y1 - y0 + t, t), (x, (y0 + y1) / 2, z0 + t / 2), "Timber")
        for y in posts_side:
            m.box((t, t * 0.9, height), (x, y, (z0 + z1) / 2), "Timber")
    if braces:
        angle = math.atan2(height - 0.2, 0.55)
        length = math.hypot(height - 0.2, 0.55)
        for x in (x0, x1):
            for sign in (-1, 1):
                y = (y0 + y1) / 2 + sign * (y1 - y0) * 0.28
                m.box((t * 0.8, 0.07, length), (x, y, (z0 + z1) / 2), "Timber", rot=(sign * (math.pi / 2 - angle), 0, 0))


def stone_course(m, x0, x1, y0, y1, z0, rows=2, height=0.14):
    """Irregular stone blocks wrapped around a plinth."""
    for row in range(rows):
        z = z0 + height * (row + 0.5)
        for (a0, a1, fixed, axis) in ((x0, x1, y0, "x"), (x0, x1, y1, "x"), (y0, y1, x0, "y"), (y0, y1, x1, "y")):
            pos = a0 + (0.12 if row % 2 else 0.0)
            while pos < a1 - 0.05:
                length = min(m.rng.uniform(0.24, 0.42), a1 - pos)
                centre = pos + length / 2
                mat = "Stone" if m.rng.random() < 0.6 else "StoneDark"
                depth = 0.07 + m.rng.uniform(0, 0.025)
                if axis == "x":
                    m.box((length - 0.025, depth, height - 0.025), (centre, fixed, z), mat, bevel=0.012)
                else:
                    m.box((depth, length - 0.025, height - 0.025), (fixed, centre, z), mat, bevel=0.012)
                pos += length


def gable_roof(m, x0, x1, eave_y, eave_z, ridge_z, rows=7):
    """Two shingled slopes along X with a ridge cap."""
    run = eave_y
    rise = ridge_z - eave_z
    length = math.hypot(run, rise)
    angle = math.atan2(rise, run)
    width = x1 - x0
    for side in (-1, 1):
        mid = (0, side * run / 2, (eave_z + ridge_z) / 2)
        tilt = (-side * angle, 0, 0)
        m.box((width, length + 0.02, 0.06), mid, "RoofUnder", rot=tilt)
        shingle = length / rows
        for row in range(rows):
            t = (row + 0.5) / rows
            y = side * run * (1 - t)
            z = eave_z + rise * t + 0.05 + 0.01 * (rows - row)
            pos = x0 - (0.16 if row % 2 else 0.0)
            while pos < x1 - 0.02:
                w = min(m.rng.uniform(0.27, 0.36), x1 - pos)
                if w > 0.08:
                    mat = "Roof" if m.rng.random() < 0.7 else "RoofLight"
                    wobble = m.rng.uniform(-0.03, 0.03)
                    m.box((w - 0.02, shingle * 1.35, 0.045), (pos + w / 2, y, z), mat, rot=(-side * angle + wobble, 0, m.rng.uniform(-0.02, 0.02)))
                pos += w
    m.cylinder(0.075, 0.075, width + 0.05, (x0 - 0.025, 0, ridge_z + 0.06), "RoofLight", segments=6, rot=(0, math.pi / 2, 0))


def town_hall(seed=11):
    m = Model("hq", seed)
    # Plinth and stone course.
    m.box((2.95, 2.35, 0.3), (0, 0, 0.15), "StoneDark", bevel=0.04)
    stone_course(m, -1.47, 1.47, -1.17, 1.17, 0.02, rows=2)
    # Ground storey.
    m.box((2.6, 2.0, 1.15), (0, 0, 0.3 + 0.575), "Plaster")
    timber_frame(m, -1.3, 1.3, -1.0, 1.0, 0.3, 1.45, posts_front=(-0.45, 0.45), posts_side=(0.0,))
    # Jetty: the upper storey overhangs on joists.
    m.box((2.95, 2.35, 0.12), (0, 0, 1.51), "Timber", bevel=0.015)
    for i in range(10):
        x = -1.3 + i * 0.29
        m.box((0.08, 0.14, 0.08), (x, -1.2, 1.44), "Timber")
    # Upper storey.
    m.box((2.8, 2.2, 1.0), (0, 0, 1.57 + 0.5), "Plaster")
    timber_frame(m, -1.4, 1.4, -1.1, 1.1, 1.57, 2.57, posts_front=(-0.5, 0.25), posts_side=(-0.3, 0.35))
    # Gable ends and roof.
    for x in (-1.42, 1.42):
        m.prism([(-1.12, 2.55), (1.12, 2.55), (0, 3.72)], 0.08, (x, 0, 0), "Plaster", rot=(0, 0, math.pi / 2))
        m.box((0.08, 0.08, 1.12), (x + (0.03 if x > 0 else -0.03), 0, 3.12), "Timber")
    m.cylinder(0.16, 0.16, 0.06, (1.47, 0, 3.05), "Timber", segments=12, rot=(0, math.pi / 2, 0))
    m.cylinder(0.12, 0.12, 0.07, (1.47, 0, 3.05), "Glass", segments=12, rot=(0, math.pi / 2, 0))
    gable_roof(m, -1.65, 1.65, 1.38, 2.48, 3.85)
    # Chimney on the back slope.
    m.box((0.36, 0.36, 1.5), (-0.75, 0.55, 3.35), "StoneDark", bevel=0.02)
    m.box((0.46, 0.46, 0.1), (-0.75, 0.55, 4.12), "Stone", bevel=0.015)
    # Front door with an arched top, steps and a lantern.
    door_x = 0.15
    m.box((0.66, 0.08, 0.86), (door_x, -1.03, 0.3 + 0.43), "StoneLight", bevel=0.01)
    m.cylinder(0.33, 0.33, 0.08, (door_x, -0.99, 1.16), "StoneLight", segments=14, rot=(math.pi / 2, 0, 0))
    m.box((0.5, 0.07, 0.8), (door_x, -1.07, 0.3 + 0.4), "Wood")
    m.cylinder(0.25, 0.25, 0.07, (door_x, -1.035, 1.1), "Wood", segments=14, rot=(math.pi / 2, 0, 0))
    for dx in (-0.12, 0.0, 0.12):
        m.box((0.02, 0.08, 1.0), (door_x + dx, -1.08, 0.82), "WoodDark")
    m.box((0.5, 0.08, 0.04), (door_x, -1.09, 0.55), "Metal")
    m.box((0.5, 0.08, 0.04), (door_x, -1.09, 0.95), "Metal")
    m.ico(0.035, (door_x + 0.17, -1.12, 0.72), "Brass", subdivisions=1)
    m.box((0.9, 0.3, 0.12), (door_x, -1.3, 0.24), "StoneLight", bevel=0.015)
    m.box((1.0, 0.3, 0.12), (door_x, -1.5, 0.1), "StoneLight", bevel=0.015)
    m.box((0.05, 0.22, 0.05), (door_x - 0.48, -1.12, 1.15), "Metal")
    m.box((0.13, 0.13, 0.18), (door_x - 0.48, -1.22, 1.05), "Lamp", bevel=0.01)
    m.cylinder(0.11, 0.0, 0.1, (door_x - 0.48, -1.22, 1.14), "Metal", segments=4, rot=(0, 0, math.pi / 4))
    # Windows.
    window(m, FRONT, -1.0, 0.88, 0.95)
    window(m, FRONT, -1.1, 0.95, 2.07, flower_box=True)
    window(m, FRONT, -1.1, 0.1, 2.07, flower_box=True)
    window(m, SIDE, 1.3, -0.45, 0.95)
    window(m, SIDE, 1.3, 0.5, 0.95)
    window(m, SIDE, 1.4, -0.5, 2.07, flower_box=True)
    window(m, SIDE, 1.4, 0.45, 2.07, flower_box=True)

    # Corner tower with spire and the health banner.
    tx, ty = -1.22, -0.98
    m.box((1.18, 1.18, 0.38), (tx, ty, 0.19), "StoneDark", bevel=0.03)
    m.box((1.0, 1.0, 3.95), (tx, ty, 0.38 + 1.975), "Stone")
    for level in range(13):
        z = 0.5 + level * 0.3
        long_x = level % 2 == 0
        for cx in (-1, 1):
            for cy in (-1, 1):
                size = (0.3, 0.18, 0.26) if long_x else (0.18, 0.3, 0.26)
                offset = (0.06 if long_x else 0.0, 0.0 if long_x else 0.06)
                m.box(size, (tx + cx * (0.46 - offset[0] * cx * cx), ty + cy * (0.46 - offset[1] * cy * cy), z), "StoneLight", bevel=0.015)
    for face, plane, along in ((FRONT, ty - 0.5, tx),):
        for z in (1.6, 2.85):
            window(m, face, plane, along, z, width=0.26, height=0.5, shutters=False)
            out = -1 if face == FRONT else 1
            arch = (along, plane + out * 0.03, z + 0.25) if face == FRONT else (plane + out * 0.03, along, z + 0.25)
            m.cylinder(0.19, 0.19, 0.06, arch, "StoneLight", segments=10, rot=(math.pi / 2, 0, 0) if face == FRONT else (0, math.pi / 2, 0))
    m.box((1.2, 1.2, 0.14), (tx, ty, 4.4), "StoneLight", bevel=0.02)
    for i in range(8):
        a = i / 8 * math.tau
        m.box((0.12, 0.12, 0.1), (tx + math.cos(a) * 0.55, ty + math.sin(a) * 0.55, 4.28), "StoneLight")
    m.cylinder(0.86, 0.0, 1.7, (tx, ty, 4.47), "Accent", segments=4, rot=(0, 0, math.pi / 4), bevel=0.01)
    m.cylinder(0.025, 0.02, 0.85, (tx, ty, 6.1), "Metal", segments=6)
    m.ico(0.06, (tx, ty, 6.15), "Brass", subdivisions=1)
    for i in range(4):
        m.box((0.13, 0.02, 0.3), (tx + 0.1 + i * 0.12, ty, 6.78 - 0.02 * i), "Accent", rot=(0, 0, 0.12 * math.sin(i * 1.7)))
    # Banner on the tower front.
    m.cylinder(0.02, 0.02, 0.62, (tx - 0.31, ty - 0.54, 3.55), "Metal", segments=6, rot=(0, math.pi / 2, 0))
    m.box((0.46, 0.03, 0.82), (tx, ty - 0.535, 3.12), "Accent")
    m.prism([(-0.23, 0), (0.23, 0), (0, 0.18)], 0.03, (tx, ty - 0.535, 2.71), "Accent", rot=(math.pi, 0, 0))
    m.ico(0.07, (tx, ty - 0.56, 3.2), "Brass", subdivisions=1, scale=(1, 0.4, 1))
    return m.build()


def ci_tower(seed=21):
    """Slim lighthouse-like pipeline tower; the lantern glass is the status beacon."""
    m = Model("tower_ci", seed)
    m.cylinder(0.64, 0.6, 0.4, (0, 0, 0), "StoneDark", segments=8, bevel=0.03)
    m.cylinder(0.5, 0.37, 3.0, (0, 0, 0.4), "Stone", segments=8)
    for z, r in ((1.2, 0.47), (2.2, 0.43), (3.1, 0.39)):
        m.cylinder(r + 0.03, r + 0.02, 0.1, (0, 0, z), "Metal", segments=8)
    for z in (1.6, 2.6):
        m.box((0.1, 0.06, 0.32), (0, -0.44 + (z - 1.6) * 0.04, z), "Glass")
        m.box((0.16, 0.06, 0.04), (0, -0.45 + (z - 1.6) * 0.04, z + 0.19), "StoneLight")
    # Small arched door.
    m.box((0.3, 0.08, 0.45), (0, -0.55, 0.62), "Wood")
    m.cylinder(0.15, 0.15, 0.08, (0, -0.51, 0.85), "Wood", segments=10, rot=(math.pi / 2, 0, 0))
    m.box((0.4, 0.06, 0.08), (0, -0.6, 0.42), "StoneLight")
    # The pipeline: pipes feeding the tower, with flanges and a valve wheel.
    m.cylinder(0.065, 0.065, 1.35, (0.52, 0.1, 0.25), "Brass", segments=8)
    m.ico(0.085, (0.52, 0.1, 1.62), "Brass", subdivisions=1)
    m.cylinder(0.065, 0.065, 0.12, (0.52, 0.1, 1.62), "Brass", segments=8, rot=(0, -math.pi / 2, 0))
    for z in (0.55, 1.1):
        m.cylinder(0.09, 0.09, 0.05, (0.52, 0.1, z), "Metal", segments=8)
    m.cylinder(0.075, 0.075, 0.95, (0.5, 0.1, 0.25), "Brass", segments=8, rot=(0, math.pi / 2, 0))
    m.ico(0.09, (0.52, 0.1, 0.25), "Brass", subdivisions=1)
    m.cylinder(0.11, 0.11, 0.05, (1.2, 0.1, 0.25), "Metal", segments=8, rot=(0, math.pi / 2, 0))
    m.torus(0.13, 0.018, (0.66, 0.1, 0.9), "Flower", segments=12, sides=5, rot=(0, math.pi / 2, 0))
    m.box((0.02, 0.24, 0.02), (0.66, 0.1, 0.9), "Metal")
    m.box((0.02, 0.02, 0.24), (0.66, 0.1, 0.9), "Metal")
    # Gallery, lantern and roof.
    m.cylinder(0.6, 0.6, 0.1, (0, 0, 3.4), "StoneLight", segments=12, bevel=0.015)
    for i in range(12):
        a = i / 12 * math.tau
        m.cylinder(0.018, 0.018, 0.26, (math.cos(a) * 0.55, math.sin(a) * 0.55, 3.5), "Metal", segments=5)
    m.torus(0.55, 0.018, (0, 0, 3.76), "Metal", segments=20, sides=5)
    m.cylinder(0.3, 0.3, 0.55, (0, 0, 3.5), "Beacon", segments=8)
    for i in range(8):
        a = (i + 0.5) / 8 * math.tau
        m.box((0.04, 0.04, 0.58), (math.cos(a) * 0.3, math.sin(a) * 0.3, 3.78), "Metal")
    m.cylinder(0.36, 0.36, 0.06, (0, 0, 4.04), "Metal", segments=8)
    m.cylinder(0.42, 0.0, 0.62, (0, 0, 4.1), "Roof", segments=8, bevel=0.01)
    m.cylinder(0.02, 0.01, 0.25, (0, 0, 4.68), "Brass", segments=5)
    m.ico(0.05, (0, 0, 4.76), "Brass", subdivisions=1)
    return m.build()


def release_tower(seed=31):
    """Wide harbour keep: a brazier beacon on the battlements, crates and a crane for shipping."""
    m = Model("tower_release", seed)
    m.cylinder(0.88, 0.85, 0.3, (0, 0, 0), "StoneDark", segments=14, bevel=0.03)
    m.cylinder(0.74, 0.7, 1.95, (0, 0, 0.3), "Stone", segments=14)
    for z in (0.75, 1.2, 1.65):
        m.cylinder(0.76, 0.75, 0.06, (0, 0, z), "StoneDark", segments=14)
    m.cylinder(0.82, 0.82, 0.22, (0, 0, 2.25), "StoneLight", segments=14, bevel=0.02)
    for i in range(10):
        a = (i + 0.5) / 10 * math.tau
        m.box((0.24, 0.18, 0.26), (math.cos(a) * 0.74, math.sin(a) * 0.74, 2.6), "StoneLight", rot=(0, 0, a), bevel=0.015)
    # Gate.
    m.box((0.56, 0.1, 0.72), (0, -0.7, 0.3 + 0.36), "Wood")
    m.cylinder(0.28, 0.28, 0.1, (0, -0.66, 1.02), "Wood", segments=14, rot=(math.pi / 2, 0, 0))
    for z in (0.5, 0.85):
        m.box((0.6, 0.11, 0.05), (0, -0.71, z), "Metal")
    m.cylinder(0.34, 0.34, 0.08, (0, -0.64, 1.02), "StoneLight", segments=14, rot=(math.pi / 2, 0, 0))
    for a, z in ((-0.6, 1.55), (0.9, 1.4)):
        x, y = math.sin(a) * 0.72, -math.cos(a) * 0.72
        m.box((0.14, 0.06, 0.3), (x, y, z), "Glass", rot=(0, 0, a))
    # Brazier beacon on the roof.
    m.cylinder(0.12, 0.1, 0.35, (0, 0, 2.36), "Metal", segments=8)
    m.cylinder(0.18, 0.34, 0.24, (0, 0, 2.7), "Metal", segments=10)
    m.ico(0.26, (0, 0, 3.0), "Beacon", subdivisions=1, scale=(1, 1, 1.5), jitter=0.04)
    # Flag.
    m.cylinder(0.03, 0.025, 1.3, (-0.5, 0.45, 2.36), "Metal", segments=6)
    for i in range(4):
        m.box((0.16, 0.02, 0.34), (-0.42 + i * 0.15, 0.45, 3.45 - 0.02 * i), "Flag", rot=(0, 0, 0.15 * math.sin(i * 1.9)))
    # Crane and crates on the quay side.
    m.box((0.12, 0.12, 2.0), (0.95, 0.35, 1.0), "Wood", bevel=0.01)
    m.box((1.0, 0.1, 0.1), (1.35, 0.35, 1.95), "Wood", rot=(0, -0.25, 0), bevel=0.01)
    m.box((0.06, 0.06, 0.55), (0.95, 0.35, 1.65), "Wood", rot=(0, 0.6, 0))
    m.cylinder(0.01, 0.01, 0.9, (1.78, 0.35, 1.18), "Dark", segments=4)
    m.box((0.3, 0.3, 0.3), (1.78, 0.35, 1.0), "Wood", bevel=0.02)
    for (x, y, s) in ((1.2, -0.25, 0.36), (1.5, -0.45, 0.3), (1.25, -0.6, 0.26)):
        m.box((s, s, s), (x, y, s / 2), "Wood", rot=(0, 0, m.rng.uniform(-0.3, 0.3)), bevel=0.02)
        m.box((s + 0.01, s * 0.15, s + 0.01), (x, y, s / 2), "WoodDark", rot=(0, 0, 0))
    m.cylinder(0.16, 0.16, 0.4, (1.55, 0.1, 0), "WoodDark", segments=10)
    m.torus(0.16, 0.02, (1.55, 0.1, 0.12), "Metal", segments=12, sides=4)
    m.torus(0.16, 0.02, (1.55, 0.1, 0.3), "Metal", segments=12, sides=4)
    return m.build()
