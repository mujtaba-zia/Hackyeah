"""Plaza, nursery, pull-request creatures and scenery."""

import math

from kitlib import Model


def plaza(seed=41, radius=3.0):
    """Cobbled town square sized to the plaza radius; the centre stays clear for creatures."""
    m = Model("plaza", seed)
    m.cylinder(radius + 0.05, radius + 0.05, 0.04, (0, 0, 0), "PavingDark", segments=40)
    ring = 0.32
    r = 0.22
    while r < radius - 0.15:
        count = max(5, round(math.tau * r / 0.34))
        offset = m.rng.uniform(0, math.tau)
        for i in range(count):
            a = offset + i / count * math.tau
            arc = math.tau * r / count
            mat = "Paving" if m.rng.random() < 0.65 else "PavingLight"
            h = 0.035 + m.rng.uniform(0, 0.015)
            m.box((arc * 0.86, ring * 0.82, h), (math.cos(a) * r, math.sin(a) * r, 0.04 + h / 2), mat, rot=(0, 0, a + math.pi / 2))
        r += ring
    curb = 30
    for i in range(curb):
        a = i / curb * math.tau
        m.box((math.tau * radius / curb * 0.92, 0.2, 0.12), (math.cos(a) * radius, math.sin(a) * radius, 0.06), "StoneLight", rot=(0, 0, a + math.pi / 2), bevel=0.015)
    # Lamps at the diagonals, benches and planters around the edge.
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        x, y = math.cos(a) * (radius + 0.25), math.sin(a) * (radius + 0.25)
        m.cylinder(0.1, 0.08, 0.12, (x, y, 0), "Metal", segments=8)
        m.cylinder(0.035, 0.03, 1.15, (x, y, 0.1), "Metal", segments=6)
        m.cylinder(0.05, 0.11, 0.06, (x, y, 1.22), "Metal", segments=6)
        m.box((0.15, 0.15, 0.18), (x, y, 1.37), "Lamp", bevel=0.01)
        m.cylinder(0.14, 0.0, 0.12, (x, y, 1.46), "Metal", segments=4, rot=(0, 0, math.pi / 4))
    for a in (math.pi * 0.0, math.pi):
        x, y = math.cos(a) * (radius + 0.35), math.sin(a) * (radius + 0.35)
        rot = (0, 0, a + math.pi / 2)
        m.box((0.9, 0.28, 0.06), (x, y, 0.3), "Wood", rot=rot, bevel=0.01)
        back = (math.cos(a) * (radius + 0.48), math.sin(a) * (radius + 0.48))
        m.box((0.9, 0.05, 0.22), (back[0], back[1], 0.48), "Wood", rot=rot, bevel=0.01)
        for s in (-0.35, 0.35):
            lx = x + math.cos(a + math.pi / 2) * s
            ly = y + math.sin(a + math.pi / 2) * s
            m.box((0.05, 0.26, 0.3), (lx, ly, 0.15), "Metal", rot=rot)
    for a in (math.pi / 2, math.pi * 1.5):
        x, y = math.cos(a) * (radius + 0.3), math.sin(a) * (radius + 0.3)
        m.cylinder(0.3, 0.24, 0.32, (x, y, 0), "StoneLight", segments=10, bevel=0.02)
        m.cylinder(0.27, 0.27, 0.04, (x, y, 0.3), "Bark", segments=10)
        m.ico(0.3, (x, y, 0.52), "Leaf", subdivisions=1, jitter=0.04)
        for j in range(4):
            b = j / 4 * math.tau
            m.ico(0.06, (x + math.cos(b) * 0.2, y + math.sin(b) * 0.2, 0.62), "Flower" if j % 2 else "FlowerYellow", subdivisions=1)
    return m.build()


def nursery(seed=51, radius=2.0):
    """Hay-covered paddock with a picket fence; drafts hatch in here."""
    m = Model("nursery", seed)
    m.cylinder(radius, radius + 0.05, 0.035, (0, 0, 0), "Hay", segments=28, jitter=0.02)
    for i in range(26):
        a = m.rng.uniform(0, math.tau)
        d = math.sqrt(m.rng.random()) * (radius - 0.15)
        m.box((0.18, 0.02, 0.012), (math.cos(a) * d, math.sin(a) * d, 0.045), "Straw", rot=(0, 0, m.rng.uniform(0, math.pi)))
    posts = 22
    gate = -math.pi / 2  # gap faces the camera (-Y)
    fence_r = radius + 0.18
    for i in range(posts):
        a = i / posts * math.tau
        if abs(math.atan2(math.sin(a - gate), math.cos(a - gate))) < 0.25:
            continue
        x, y = math.cos(a) * fence_r, math.sin(a) * fence_r
        m.box((0.07, 0.07, 0.5), (x, y, 0.25), "Wood", rot=(0, 0, a), bevel=0.01)
        m.cylinder(0.05, 0.0, 0.08, (x, y, 0.5), "Wood", segments=4, rot=(0, 0, a + math.pi / 4))
        nxt = (i + 1) / posts * math.tau
        if abs(math.atan2(math.sin(nxt - gate), math.cos(nxt - gate))) < 0.25:
            continue
        mid = (a + nxt) / 2
        span = 2 * fence_r * math.sin((nxt - a) / 2)
        for z in (0.18, 0.36):
            m.box((span, 0.035, 0.06), (math.cos(mid) * fence_r, math.sin(mid) * fence_r, z), "WoodDark", rot=(0, 0, mid + math.pi / 2))
    # Sign by the gate and two hay bales outside.
    sx, sy = math.cos(gate + 0.45) * (fence_r + 0.25), math.sin(gate + 0.45) * (fence_r + 0.25)
    m.box((0.06, 0.06, 0.7), (sx, sy, 0.35), "Wood")
    m.box((0.5, 0.05, 0.28), (sx, sy - 0.04, 0.72), "Wood", bevel=0.015)
    m.box((0.36, 0.06, 0.04), (sx, sy - 0.07, 0.76), "Cloth")
    for (a, d) in ((0.3, 0.55), (2.6, 0.5)):
        x, y = math.cos(a) * (fence_r + d), math.sin(a) * (fence_r + d)
        m.cylinder(0.22, 0.22, 0.5, (x - 0.25, y, 0.22), "Hay", segments=10, rot=(0, math.pi / 2, 0), bevel=0.02)
        for dx in (-0.1, 0.1):
            m.torus(0.225, 0.012, (x + dx, y, 0.22), "Straw", segments=12, sides=4, rot=(0, math.pi / 2, 0))
    return m.build()


def creature(seed=61):
    """A round little pull-request critter. `Body` is recoloured per mood."""
    m = Model("creature", seed)
    m.sphere(0.27, (0, 0, 0.33), "Body", segments=18, rings=12, scale=(1, 0.92, 1.05))
    m.sphere(0.17, (0, -0.2, 0.28), "Belly", segments=14, rings=10, scale=(1, 0.42, 1.08))
    for s in (-1, 1):
        m.sphere(0.09, (s * 0.12, -0.04, 0.05), "Body", segments=10, rings=6, scale=(1, 1.35, 0.55))
        m.sphere(0.065, (s * 0.27, -0.03, 0.3), "Body", segments=10, rings=6, scale=(0.8, 1, 1.2), rot=(0, s * 0.5, 0))
        m.sphere(0.078, (s * 0.098, -0.225, 0.44), "EyeWhite", segments=12, rings=8)
        m.sphere(0.045, (s * 0.098, -0.285, 0.435), "Pupil", segments=10, rings=6)
        m.sphere(0.016, (s * 0.085, -0.322, 0.455), "EyeWhite", segments=6, rings=4)
        m.sphere(0.042, (s * 0.175, -0.2, 0.34), "Cheek", segments=8, rings=5, scale=(1, 0.4, 0.7))
    m.torus(0.045, 0.012, (0, -0.272, 0.36), "Pupil", segments=8, sides=4, rot=(-math.pi / 2, 0, 0), arc=math.pi)
    m.cylinder(0.014, 0.01, 0.16, (0, 0.02, 0.6), "Body", segments=6, rot=(0.2, 0, 0))
    m.sphere(0.045, (0, 0.05, 0.76), "Body", segments=10, rings=6)
    return m.build()


def egg(seed=71):
    """A draft pull request: an egg in a straw nest. `Body` is the shell."""
    m = Model("egg", seed)
    m.torus(0.19, 0.075, (0, 0, 0.06), "Straw", segments=14, sides=6, jitter=0.02)
    m.cylinder(0.17, 0.17, 0.04, (0, 0, 0.02), "Hay", segments=12)
    m.sphere(0.14, (0, 0, 0.24), "Body", segments=16, rings=12, scale=(1, 1, 1.35))
    for i in range(9):
        a = m.rng.uniform(0, math.tau)
        z = m.rng.uniform(0.18, 0.38)
        r = 0.14 * math.sqrt(max(0.0, 1 - ((z - 0.24) / (0.14 * 1.35)) ** 2))
        m.sphere(0.018, (math.cos(a) * r, math.sin(a) * r, z), "Speckle", segments=6, rings=4, scale=(1, 1, 0.5))
    return m.build()


def pine(seed=81):
    m = Model("tree_pine", seed)
    m.cylinder(0.1, 0.07, 0.6, (0, 0, 0), "Bark", segments=6)
    for i, (r, h, z) in enumerate(((0.62, 0.72, 0.35), (0.52, 0.64, 0.76), (0.4, 0.56, 1.13), (0.26, 0.46, 1.46))):
        m.cylinder(r, 0.0, h, (0, 0, z), "Pine" if i % 2 == 0 else "PineDark", segments=7, rot=(0, 0, m.rng.uniform(0, 1)), jitter=0.035)
    return m.build()


def round_tree(seed=91):
    m = Model("tree_round", seed)
    m.cylinder(0.11, 0.08, 0.85, (0, 0, 0), "Bark", segments=6)
    m.cylinder(0.05, 0.03, 0.4, (0.05, 0, 0.55), "Bark", segments=5, rot=(0, 0.7, 0))
    m.cylinder(0.05, 0.03, 0.35, (-0.04, 0.02, 0.6), "Bark", segments=5, rot=(0.3, -0.7, 0))
    for (x, y, z, r, mat) in ((0, 0, 1.22, 0.46, "Leaf"), (0.28, -0.08, 1.02, 0.34, "LeafLight"), (-0.26, 0.1, 1.05, 0.33, "Leaf"), (0.05, 0.22, 1.5, 0.3, "LeafLight"), (-0.05, -0.22, 1.42, 0.28, "Leaf")):
        m.ico(r, (x, y, z), mat, subdivisions=1, jitter=0.04)
    return m.build()


def birch(seed=101):
    m = Model("tree_birch", seed)
    m.cylinder(0.075, 0.05, 1.35, (0, 0, 0), "Birch", segments=6)
    for i in range(9):
        z = 0.15 + i * 0.13
        a = m.rng.uniform(0, math.tau)
        r = 0.073 - z * 0.015
        m.box((0.06, 0.02, 0.025), (math.cos(a) * r, math.sin(a) * r, z), "Dark", rot=(0, 0, a + math.pi / 2))
    for (x, y, z, r) in ((0, 0, 1.45, 0.32), (0.18, 0.05, 1.25, 0.24), (-0.16, -0.06, 1.3, 0.25), (0.02, -0.12, 1.7, 0.2)):
        m.ico(r, (x, y, z), "LeafBirch", subdivisions=1, jitter=0.035)
    return m.build()


def _boulder(m, radius, loc, scale, moss=True):
    verts = m.ico(radius, loc, "Stone", subdivisions=2, scale=scale, jitter=radius * 0.16)
    if moss:
        moss_index = m._index("Moss")
        for face in dict.fromkeys(face for vert in verts for face in vert.link_faces):
            face.normal_update()
            if face.normal.z > 0.86:
                face.material_index = moss_index


def rocks(seed=111):
    built = []
    m = Model("rock_1", seed)
    _boulder(m, 0.42, (0, 0, 0.2), (1.25, 1.0, 0.72))
    built.append(m.build())
    m = Model("rock_2", seed + 1)
    _boulder(m, 0.3, (0, 0, 0.15), (1.1, 1.0, 0.8))
    _boulder(m, 0.2, (0.33, 0.12, 0.08), (1.0, 1.1, 0.7), moss=False)
    _boulder(m, 0.13, (-0.25, -0.2, 0.05), (1.0, 1.0, 0.8), moss=False)
    built.append(m.build())
    m = Model("rock_3", seed + 2)
    _boulder(m, 0.36, (0, 0, 0.08), (1.4, 1.1, 0.42))
    _boulder(m, 0.1, (0.42, -0.15, 0.04), (1, 1, 0.8), moss=False)
    built.append(m.build())
    return built
