"""Pipeline towers in four stages: foundations, under construction, built and broken.

The renderer picks the stage from the pipeline's latest run: queued or never
run -> foundations, running -> under construction, passing -> built, failed ->
broken. Every stage has some `Beacon` geometry (a lamp, a work lantern, embers)
so the status colour is always visible.
"""

import math

from kitlib import Model

STONES = ("Stone", "StoneDark", "StoneLight")


# --- shared pieces ------------------------------------------------------------


def jag_top(m, verts, top, depth):
    """Breaks a straight top edge into an uneven, unfinished or snapped one."""
    for vert in verts:
        if vert.co.z > top - 1e-4:
            vert.co.z -= m.rng.uniform(0.0, depth)


def stone_pile(m, x, y, count=7, size=0.16):
    for i in range(count):
        layer = 0 if i < count * 0.6 else 1
        dx, dy = m.rng.uniform(-0.18, 0.18), m.rng.uniform(-0.15, 0.15)
        s = size * m.rng.uniform(0.8, 1.15)
        m.box((s * 1.4, s, s * 0.8), (x + dx, y + dy, s * 0.4 + layer * s * 0.8), m.rng.choice(STONES), rot=(0, 0, m.rng.uniform(0, math.pi)), bevel=0.012)


def plank_stack(m, x, y, count=5):
    for i in range(count):
        m.box((0.8, 0.09, 0.035), (x, y + (i % 2) * 0.03, 0.02 + i * 0.037), "Wood", rot=(0, 0, 0.6 + m.rng.uniform(-0.08, 0.08)))


def rubble(m, x, y, radius, count):
    for _ in range(count):
        a = m.rng.uniform(0, math.tau)
        d = math.sqrt(m.rng.random()) * radius
        s = m.rng.uniform(0.07, 0.17)
        if m.rng.random() < 0.6:
            m.box((s * 1.3, s, s * 0.7), (x + math.cos(a) * d, y + math.sin(a) * d, s * 0.3), m.rng.choice(STONES), rot=(m.rng.uniform(-0.4, 0.4), m.rng.uniform(-0.4, 0.4), m.rng.uniform(0, math.pi)))
        else:
            m.ico(s * 0.8, (x + math.cos(a) * d, y + math.sin(a) * d, s * 0.35), m.rng.choice(STONES), subdivisions=1, jitter=s * 0.15)


def lamp_post(m, x, y, height=1.15):
    """A builder's lamp on a post; the lamp shows the status colour."""
    m.box((0.06, 0.06, height), (x, y, height / 2), "Wood")
    m.box((0.28, 0.05, 0.05), (x + 0.11, y, height - 0.05), "Wood")
    m.cylinder(0.006, 0.006, 0.12, (x + 0.22, y, height - 0.18), "Dark", segments=4)
    m.box((0.13, 0.13, 0.16), (x + 0.22, y, height - 0.28), "Beacon", bevel=0.01)
    m.cylinder(0.1, 0.0, 0.08, (x + 0.22, y, height - 0.2), "Metal", segments=4, rot=(0, 0, math.pi / 4))


def stakes(m, radius, z=0.12):
    """Survey stakes with a string line marking where the walls will go."""
    corners = []
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        x, y = math.cos(a) * radius, math.sin(a) * radius
        corners.append((x, y))
        m.box((0.04, 0.04, 0.3), (x, y, 0.15), "Wood")
    for i in range(4):
        (x0, y0), (x1, y1) = corners[i], corners[(i + 1) % 4]
        length = math.hypot(x1 - x0, y1 - y0)
        m.box((length, 0.008, 0.008), ((x0 + x1) / 2, (y0 + y1) / 2, z + 0.1), "Flower", rot=(0, 0, math.atan2(y1 - y0, x1 - x0)))


def scaffold(m, radius, height, levels, posts=6):
    """Timber scaffolding: posts, rails, plank decks, braces and a ladder at the front."""
    angles = [(i + 0.5) / posts * math.tau for i in range(posts)]
    points = [(math.cos(a) * radius, math.sin(a) * radius) for a in angles]
    for x, y in points:
        m.box((0.06, 0.06, height), (x, y, height / 2), "Wood")
    for level, z in enumerate(levels):
        for i in range(posts):
            (x0, y0), (x1, y1) = points[i], points[(i + 1) % posts]
            mid = ((x0 + x1) / 2, (y0 + y1) / 2)
            length = math.hypot(x1 - x0, y1 - y0)
            angle = math.atan2(y1 - y0, x1 - x0)
            m.box((length + 0.04, 0.045, 0.05), (mid[0], mid[1], z + 0.35), "WoodDark", rot=(0, 0, angle))
            inward = (-mid[0] / radius * 0.13, -mid[1] / radius * 0.13)
            m.box((length * 0.95, 0.24, 0.035), (mid[0] + inward[0], mid[1] + inward[1], z), "Wood", rot=(0, 0, angle))
            if (i + level) % 2 == 0 and level + 1 < len(levels):
                rise = levels[level + 1] - z
                brace = math.hypot(length, rise)
                m.box((brace, 0.03, 0.035), (mid[0], mid[1], z + rise / 2), "WoodDark", rot=(0, -math.atan2(rise, length), angle))
    # Ladder up the front.
    front = (0.0, -radius - 0.06)
    for dx in (-0.12, 0.12):
        m.box((0.035, 0.035, height), (front[0] + dx, front[1], height / 2), "WoodDark")
    rung = 0.2
    z = rung
    while z < height - 0.05:
        m.box((0.24, 0.025, 0.025), (front[0], front[1], z), "WoodDark")
        z += rung


def hoist(m, x, y, top, reach=0.7, load=0.7):
    """A beam over the scaffold with a rope and a stone block being lifted."""
    m.box((reach + 0.2, 0.08, 0.08), (x + reach / 2, y, top), "Wood")
    m.cylinder(0.05, 0.05, 0.06, (x + reach, y, top - 0.08), "Metal", segments=8, rot=(math.pi / 2, 0, 0))
    m.cylinder(0.01, 0.01, top - load - 0.12, (x + reach, y, load + 0.12), "Dark", segments=4)
    m.box((0.22, 0.18, 0.16), (x + reach, y, load), "StoneLight", bevel=0.015)


def embers(m, x, y, z, radius, count):
    """Smouldering coals in the status colour."""
    for _ in range(count):
        a = m.rng.uniform(0, math.tau)
        d = m.rng.uniform(0, radius)
        m.ico(m.rng.uniform(0.04, 0.08), (x + math.cos(a) * d, y + math.sin(a) * d, z + m.rng.uniform(0, 0.08)), "Beacon", subdivisions=1, jitter=0.012)


# --- CI tower (lighthouse) ----------------------------------------------------

CI_TOP = 3.4  # where the finished shaft ends and the gallery begins


def ci_radius(z):
    return 0.5 - 0.13 * (z - 0.4) / (CI_TOP - 0.4)


def ci_plinth(m):
    m.cylinder(0.64, 0.6, 0.4, (0, 0, 0), "StoneDark", segments=8, bevel=0.03)


def ci_shaft(m, height, jag=0.0, rot=(0, 0, 0)):
    """The stone shaft from the plinth up to `height`, optionally left unfinished or snapped."""
    top = 0.4 + height
    verts = m.cylinder(0.5, ci_radius(top), height, (0, 0, 0.4), "Stone", segments=8, rot=rot)
    if jag:
        jag_top(m, verts, top, jag)
    for z in (1.2, 2.2, 3.1):
        if z + 0.1 < top - jag:
            r = ci_radius(z)
            m.cylinder(r + 0.03, r + 0.02, 0.1, (0, 0, z), "Metal", segments=8, rot=rot)


def ci_door(m):
    m.box((0.3, 0.08, 0.45), (0, -0.55, 0.62), "Wood")
    m.cylinder(0.15, 0.15, 0.08, (0, -0.51, 0.85), "Wood", segments=10, rot=(math.pi / 2, 0, 0))
    m.box((0.4, 0.06, 0.08), (0, -0.6, 0.42), "StoneLight")


def ci_pipes(m, full=True):
    m.cylinder(0.075, 0.075, 0.95, (0.5, 0.1, 0.25), "Brass", segments=8, rot=(0, math.pi / 2, 0))
    m.ico(0.09, (0.52, 0.1, 0.25), "Brass", subdivisions=1)
    m.cylinder(0.11, 0.11, 0.05, (1.2, 0.1, 0.25), "Metal", segments=8, rot=(0, math.pi / 2, 0))
    if not full:
        return
    m.cylinder(0.065, 0.065, 1.35, (0.52, 0.1, 0.25), "Brass", segments=8)
    m.ico(0.085, (0.52, 0.1, 1.62), "Brass", subdivisions=1)
    m.cylinder(0.065, 0.065, 0.12, (0.52, 0.1, 1.62), "Brass", segments=8, rot=(0, -math.pi / 2, 0))
    for z in (0.55, 1.1):
        m.cylinder(0.09, 0.09, 0.05, (0.52, 0.1, z), "Metal", segments=8)
    m.torus(0.13, 0.018, (0.66, 0.1, 0.9), "Flower", segments=12, sides=5, rot=(0, math.pi / 2, 0))
    m.box((0.02, 0.24, 0.02), (0.66, 0.1, 0.9), "Metal")
    m.box((0.02, 0.02, 0.24), (0.66, 0.1, 0.9), "Metal")


def ci_tower(seed=21):
    """Built: the slim lighthouse; the lantern glass is the status beacon."""
    m = Model("tower_ci", seed)
    ci_plinth(m)
    ci_shaft(m, CI_TOP - 0.4)
    for z in (1.6, 2.6):
        m.box((0.1, 0.06, 0.32), (0, -0.44 + (z - 1.6) * 0.04, z), "Glass")
        m.box((0.16, 0.06, 0.04), (0, -0.45 + (z - 1.6) * 0.04, z + 0.19), "StoneLight")
    ci_door(m)
    ci_pipes(m)
    m.cylinder(0.6, 0.6, 0.1, (0, 0, CI_TOP), "StoneLight", segments=12, bevel=0.015)
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


def ci_tower_foundation(seed=22):
    """Queued / not yet run: footings, the first course of stones, and materials waiting."""
    m = Model("tower_ci_foundation", seed)
    ci_plinth(m)
    for i in range(10):
        if i in (2, 3, 7):
            continue
        a = (i + 0.5) / 10 * math.tau
        m.box((0.3, 0.16, 0.18), (math.cos(a) * 0.43, math.sin(a) * 0.43, 0.49), m.rng.choice(STONES), rot=(0, 0, a + math.pi / 2), bevel=0.012)
    stakes(m, 0.95)
    stone_pile(m, 0.85, -0.55)
    plank_stack(m, -0.75, 0.55)
    m.cylinder(0.075, 0.075, 0.7, (0.55, 0.75, 0.08), "Brass", segments=8, rot=(0, math.pi / 2, 0.4))
    m.cylinder(0.14, 0.14, 0.38, (-0.8, -0.55, 0), "WoodDark", segments=10)
    m.torus(0.14, 0.018, (-0.8, -0.55, 0.12), "Metal", segments=12, sides=4)
    lamp_post(m, 0.75, 0.25)
    return m.build()


def ci_tower_building(seed=23):
    """Running: the shaft half built inside scaffolding, a block on the hoist, work lanterns lit."""
    m = Model("tower_ci_building", seed)
    ci_plinth(m)
    ci_shaft(m, 1.55, jag=0.14)
    ci_door(m)
    m.box((0.1, 0.06, 0.32), (0, -0.45, 1.5), "Glass")
    ci_pipes(m, full=False)
    m.cylinder(0.065, 0.065, 0.7, (0.52, 0.1, 0.25), "Brass", segments=8)
    scaffold(m, 0.74, 2.5, levels=(0.85, 1.65, 2.4))
    hoist(m, 0.45, 0.45, 2.55, reach=0.65, load=1.25)
    for x, y, z in ((-0.55, -0.55, 2.2), (0.6, -0.5, 1.4)):
        m.cylinder(0.006, 0.006, 0.1, (x, y, z + 0.1), "Dark", segments=4)
        m.box((0.12, 0.12, 0.15), (x, y, z), "Beacon", bevel=0.01)
    stone_pile(m, -0.95, 0.35, count=6)
    return m.build()


def ci_tower_broken(seed=24):
    """Failed: the shaft snapped and leaning, the roof and lantern fallen, embers smouldering."""
    m = Model("tower_ci_broken", seed)
    ci_plinth(m)
    lean = (0.06, -0.04, 0)
    height = 1.45
    top = 0.4 + height
    ci_shaft(m, height, jag=0.25, rot=lean)
    # A hollow, snapped top: dark inside, broken stone teeth standing up around the rim.
    r = ci_radius(top)
    m.cylinder(r * 0.78, r * 0.78, 0.06, (0, 0, top - 0.32), "Dark", segments=8, rot=lean)
    for i in range(9):
        a = (i + m.rng.uniform(-0.2, 0.2)) / 9 * math.tau
        h = m.rng.uniform(0.12, 0.55)
        m.box((0.24, 0.12, h), (math.cos(a) * r * 0.9, math.sin(a) * r * 0.9, top - 0.3 + h / 2), m.rng.choice(STONES), rot=(m.rng.uniform(-0.25, 0.25), m.rng.uniform(-0.25, 0.25), a + math.pi / 2), bevel=0.01)
    ci_door(m)
    for x, z, h in ((-0.12, 1.0, 0.45), (0.12, 1.35, 0.3)):
        m.box((0.02, 0.03, h), (x, -0.47, z), "Dark", rot=(0, m.rng.uniform(-0.5, 0.5), 0))
    # The fallen top: roof cone, a piece of the gallery and the lantern frame.
    m.cylinder(0.42, 0.0, 0.62, (0.95, -0.55, 0.32), "Roof", segments=8, rot=(1.45, 0.0, 0.7))
    m.torus(0.55, 0.03, (-0.7, -0.8, 0.05), "Metal", segments=10, sides=4, arc=math.pi * 0.8, rot=(0.1, 0, 0.6))
    for i in range(5):
        a = m.rng.uniform(0, math.tau)
        m.box((0.04, 0.04, 0.5), (0.9 + math.cos(a) * 0.4, -0.2 + math.sin(a) * 0.4, 0.05), "Metal", rot=(math.pi / 2 - 0.1, 0, a))
    for _ in range(8):
        m.box((0.08, 0.06, 0.01), (m.rng.uniform(0.4, 1.2), m.rng.uniform(-0.9, 0.1), 0.01), "Glass", rot=(0, 0, m.rng.uniform(0, math.pi)))
    rubble(m, 0.3, -0.3, 1.2, 22)
    # Burst pipe.
    m.cylinder(0.065, 0.065, 0.6, (0.52, 0.1, 0.25), "Brass", segments=8)
    m.cylinder(0.065, 0.065, 0.5, (0.85, 0.55, 0.07), "Brass", segments=8, rot=(0, math.pi / 2, 1.1))
    ci_pipes(m, full=False)
    embers(m, 0.05, -0.05, 1.6, 0.22, 8)
    embers(m, 0.85, -0.5, 0.05, 0.25, 5)
    return m.build()


# --- Release tower (harbour keep) ----------------------------------------------


def keep_plinth(m):
    m.cylinder(0.88, 0.85, 0.3, (0, 0, 0), "StoneDark", segments=14, bevel=0.03)


def keep_body(m, height, jag=0.0, rot=(0, 0, 0)):
    top = 0.3 + height
    verts = m.cylinder(0.74, 0.72 if height < 1.9 else 0.7, height, (0, 0, 0.3), "Stone", segments=14, rot=rot)
    if jag:
        jag_top(m, verts, top, jag)
    for z in (0.75, 1.2, 1.65):
        if z + 0.06 < top - jag:
            m.cylinder(0.76, 0.75, 0.06, (0, 0, z), "StoneDark", segments=14, rot=rot)


def keep_gate(m):
    m.box((0.56, 0.1, 0.72), (0, -0.7, 0.3 + 0.36), "Wood")
    m.cylinder(0.28, 0.28, 0.1, (0, -0.66, 1.02), "Wood", segments=14, rot=(math.pi / 2, 0, 0))
    for z in (0.5, 0.85):
        m.box((0.6, 0.11, 0.05), (0, -0.71, z), "Metal")
    m.cylinder(0.34, 0.34, 0.08, (0, -0.64, 1.02), "StoneLight", segments=14, rot=(math.pi / 2, 0, 0))


def crates(m):
    for (x, y, s) in ((1.2, -0.25, 0.36), (1.5, -0.45, 0.3), (1.25, -0.6, 0.26)):
        m.box((s, s, s), (x, y, s / 2), "Wood", rot=(0, 0, m.rng.uniform(-0.3, 0.3)), bevel=0.02)
        m.box((s + 0.01, s * 0.15, s + 0.01), (x, y, s / 2), "WoodDark")
    m.cylinder(0.16, 0.16, 0.4, (1.55, 0.1, 0), "WoodDark", segments=10)
    m.torus(0.16, 0.02, (1.55, 0.1, 0.12), "Metal", segments=12, sides=4)
    m.torus(0.16, 0.02, (1.55, 0.1, 0.3), "Metal", segments=12, sides=4)


def crane(m):
    m.box((0.12, 0.12, 2.0), (0.95, 0.35, 1.0), "Wood", bevel=0.01)
    m.box((1.0, 0.1, 0.1), (1.35, 0.35, 1.95), "Wood", rot=(0, -0.25, 0), bevel=0.01)
    m.box((0.06, 0.06, 0.55), (0.95, 0.35, 1.65), "Wood", rot=(0, 0.6, 0))
    m.cylinder(0.01, 0.01, 0.9, (1.78, 0.35, 1.18), "Dark", segments=4)
    m.box((0.3, 0.3, 0.3), (1.78, 0.35, 1.0), "Wood", bevel=0.02)


def release_tower(seed=31):
    """Built: the harbour keep with a brazier beacon on the battlements."""
    m = Model("tower_release", seed)
    keep_plinth(m)
    keep_body(m, 1.95)
    m.cylinder(0.82, 0.82, 0.22, (0, 0, 2.25), "StoneLight", segments=14, bevel=0.02)
    for i in range(10):
        a = (i + 0.5) / 10 * math.tau
        m.box((0.24, 0.18, 0.26), (math.cos(a) * 0.74, math.sin(a) * 0.74, 2.6), "StoneLight", rot=(0, 0, a), bevel=0.015)
    keep_gate(m)
    for a, z in ((-0.6, 1.55), (0.9, 1.4)):
        x, y = math.sin(a) * 0.72, -math.cos(a) * 0.72
        m.box((0.14, 0.06, 0.3), (x, y, z), "Glass", rot=(0, 0, a))
    m.cylinder(0.12, 0.1, 0.35, (0, 0, 2.36), "Metal", segments=8)
    m.cylinder(0.18, 0.34, 0.24, (0, 0, 2.7), "Metal", segments=10)
    m.ico(0.26, (0, 0, 3.0), "Beacon", subdivisions=1, scale=(1, 1, 1.5), jitter=0.04)
    m.cylinder(0.03, 0.025, 1.3, (-0.5, 0.45, 2.36), "Metal", segments=6)
    for i in range(4):
        m.box((0.16, 0.02, 0.34), (-0.42 + i * 0.15, 0.45, 3.45 - 0.02 * i), "Flag", rot=(0, 0, 0.15 * math.sin(i * 1.9)))
    crane(m)
    crates(m)
    return m.build()


def release_tower_foundation(seed=32):
    m = Model("tower_release_foundation", seed)
    keep_plinth(m)
    for i in range(14):
        if i in (3, 4, 9):
            continue
        a = (i + 0.5) / 14 * math.tau
        m.box((0.32, 0.18, 0.2), (math.cos(a) * 0.68, math.sin(a) * 0.68, 0.4), m.rng.choice(STONES), rot=(0, 0, a + math.pi / 2), bevel=0.012)
    stakes(m, 1.2)
    stone_pile(m, 1.15, -0.45, count=9)
    plank_stack(m, -1.0, 0.7)
    crates(m)
    lamp_post(m, -0.95, -0.65)
    return m.build()


def release_tower_building(seed=33):
    m = Model("tower_release_building", seed)
    keep_plinth(m)
    keep_body(m, 1.05, jag=0.16)
    keep_gate(m)
    scaffold(m, 0.98, 1.85, levels=(0.7, 1.35, 1.8), posts=8)
    crane(m)
    crates(m)
    for x, y, z in ((-0.7, -0.7, 1.6), (0.75, -0.65, 1.0)):
        m.cylinder(0.006, 0.006, 0.1, (x, y, z + 0.1), "Dark", segments=4)
        m.box((0.13, 0.13, 0.16), (x, y, z), "Beacon", bevel=0.01)
    stone_pile(m, -1.15, 0.2, count=7)
    return m.build()


def release_tower_broken(seed=34):
    m = Model("tower_release_broken", seed)
    keep_plinth(m)
    keep_body(m, 1.4, jag=0.6, rot=(0.05, 0.04, 0))
    keep_gate(m)
    # Fallen battlements and a toppled brazier still glowing.
    for i in range(6):
        a = m.rng.uniform(-1.2, 1.6)
        d = m.rng.uniform(1.0, 1.5)
        m.box((0.24, 0.18, 0.26), (math.cos(a) * d, -math.sin(a) * d * 0.6 - 0.3, 0.1), "StoneLight", rot=(m.rng.uniform(-0.6, 0.6), m.rng.uniform(-0.6, 0.6), m.rng.uniform(0, math.pi)), bevel=0.015)
    m.cylinder(0.18, 0.34, 0.24, (-0.95, -0.55, 0.2), "Metal", segments=10, rot=(1.3, 0, 0.4))
    embers(m, -1.0, -0.75, 0.04, 0.3, 7)
    embers(m, 0.0, 0.0, 1.45, 0.4, 6)
    # Snapped flag pole and a smashed crate.
    m.cylinder(0.03, 0.025, 1.0, (-0.45, 0.6, 0.05), "Metal", segments=6, rot=(math.pi / 2, 0, 0.9))
    m.box((0.16, 0.02, 0.34), (0.0, 1.1, 0.03), "Flag", rot=(math.pi / 2, 0, 0.5))
    for i in range(5):
        m.box((0.36, 0.05, 0.02), (1.25 + m.rng.uniform(-0.25, 0.25), -0.4 + m.rng.uniform(-0.3, 0.3), 0.02 + i * 0.01), "Wood", rot=(0, 0, m.rng.uniform(0, math.pi)))
    rubble(m, 0.2, -0.4, 1.5, 26)
    return m.build()
