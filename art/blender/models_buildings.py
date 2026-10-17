"""District headquarters."""

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
