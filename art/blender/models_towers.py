"""Pipeline towers in four stages: foundations, under construction, built and broken.

The renderer picks the stage from the pipeline's latest run: queued or never
run -> foundations, running -> under construction, passing -> built, failed ->
broken.

A CI pipeline is a lighthouse; a release pipeline is a harbour keep with a
cargo airship moored above it. Two materials carry the run's status colour and
are swapped at runtime: `Status` is paint and cloth (the lighthouse's bands and
cap, the airship's envelope), large and high so it reads from far away;
`Beacon` is light (lantern glass, work lamps, embers).
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


def stone_pile(m, x, y, count=7, size=0.2):
    for i in range(count):
        layer = 0 if i < count * 0.6 else 1
        dx, dy = m.rng.uniform(-0.2, 0.2), m.rng.uniform(-0.17, 0.17)
        s = size * m.rng.uniform(0.8, 1.15)
        m.box((s * 1.4, s, s * 0.8), (x + dx, y + dy, s * 0.4 + layer * s * 0.8), m.rng.choice(STONES), rot=(0, 0, m.rng.uniform(0, math.pi)), bevel=0.014)


def plank_stack(m, x, y, count=5):
    for i in range(count):
        m.box((0.9, 0.12, 0.045), (x, y + (i % 2) * 0.03, 0.025 + i * 0.047), "Wood", rot=(0, 0, 0.6 + m.rng.uniform(-0.08, 0.08)))


def rubble(m, x, y, radius, count):
    for _ in range(count):
        a = m.rng.uniform(0, math.tau)
        d = math.sqrt(m.rng.random()) * radius
        s = m.rng.uniform(0.1, 0.22)
        m.box((s * 1.3, s, s * 0.7), (x + math.cos(a) * d, y + math.sin(a) * d, s * 0.3), m.rng.choice(STONES), rot=(m.rng.uniform(-0.4, 0.4), m.rng.uniform(-0.4, 0.4), m.rng.uniform(0, math.pi)))


def lamp_post(m, x, y, height=1.2):
    """A builder's lamp on a post; the lamp shows the status colour."""
    m.box((0.08, 0.08, height), (x, y, height / 2), "Wood")
    m.box((0.34, 0.07, 0.07), (x + 0.13, y, height - 0.06), "Wood")
    m.box((0.2, 0.2, 0.26), (x + 0.26, y, height - 0.3), "Beacon", bevel=0.015)
    m.cylinder(0.15, 0.0, 0.1, (x + 0.26, y, height - 0.17), "Metal", segments=4, rot=(0, 0, math.pi / 4))


def work_lantern(m, x, y, z):
    """A lantern hung on scaffolding."""
    m.box((0.2, 0.2, 0.24), (x, y, z), "Beacon", bevel=0.015)
    m.cylinder(0.15, 0.0, 0.1, (x, y, z + 0.12), "Metal", segments=4, rot=(0, 0, math.pi / 4))


def stakes(m, radius):
    """Survey stakes with a string line marking where the walls will go."""
    corners = []
    for i in range(4):
        a = math.pi / 4 + i * math.pi / 2
        x, y = math.cos(a) * radius, math.sin(a) * radius
        corners.append((x, y))
        m.box((0.06, 0.06, 0.36), (x, y, 0.18), "Wood")
    for i in range(4):
        (x0, y0), (x1, y1) = corners[i], corners[(i + 1) % 4]
        length = math.hypot(x1 - x0, y1 - y0)
        m.box((length, 0.02, 0.02), ((x0 + x1) / 2, (y0 + y1) / 2, 0.3), "Rope", rot=(0, 0, math.atan2(y1 - y0, x1 - x0)))


def scaffold(m, radius, height, levels, posts=6):
    """Timber scaffolding: posts, rails, plank decks and a ladder at the front."""
    angles = [(i + 0.5) / posts * math.tau for i in range(posts)]
    points = [(math.cos(a) * radius, math.sin(a) * radius) for a in angles]
    for x, y in points:
        m.box((0.08, 0.08, height), (x, y, height / 2), "Wood")
    for z in levels:
        for i in range(posts):
            (x0, y0), (x1, y1) = points[i], points[(i + 1) % posts]
            mid = ((x0 + x1) / 2, (y0 + y1) / 2)
            length = math.hypot(x1 - x0, y1 - y0)
            angle = math.atan2(y1 - y0, x1 - x0)
            m.box((length + 0.05, 0.06, 0.06), (mid[0], mid[1], z + 0.38), "WoodDark", rot=(0, 0, angle))
            inward = (-mid[0] / radius * 0.14, -mid[1] / radius * 0.14)
            m.box((length * 0.96, 0.28, 0.045), (mid[0] + inward[0], mid[1] + inward[1], z), "Wood", rot=(0, 0, angle))
    # Ladder up the front.
    for dx in (-0.14, 0.14):
        m.box((0.045, 0.045, height), (dx, -radius - 0.08, height / 2), "WoodDark")
    z = 0.24
    while z < height - 0.05:
        m.box((0.28, 0.035, 0.035), (0, -radius - 0.08, z), "WoodDark")
        z += 0.24


def hoist(m, x, y, top, reach=0.7, load=0.7):
    """A beam over the scaffold with a rope and a stone block being lifted."""
    m.box((reach + 0.25, 0.1, 0.1), (x + reach / 2, y, top), "Wood")
    m.box((0.03, 0.03, top - load - 0.1), (x + reach, y, (top + load + 0.1) / 2), "Rope")
    m.box((0.28, 0.24, 0.2), (x + reach, y, load), "StoneLight", bevel=0.02)


def embers(m, x, y, z, radius, count):
    """Smouldering coals in the status colour."""
    for _ in range(count):
        a = m.rng.uniform(0, math.tau)
        d = m.rng.uniform(0, radius)
        m.ico(m.rng.uniform(0.07, 0.13), (x + math.cos(a) * d, y + math.sin(a) * d, z + m.rng.uniform(0, 0.1)), "Beacon", subdivisions=1, jitter=0.02)


def crates(m, x, y):
    """Cargo waiting by a tower: three crates and a barrel."""
    for (dx, dy, s) in ((0, 0, 0.4), (0.34, -0.22, 0.32), (0.04, -0.4, 0.28)):
        m.box((s, s, s), (x + dx, y + dy, s / 2), "Wood", rot=(0, 0, m.rng.uniform(-0.3, 0.3)), bevel=0.02)
        m.box((s + 0.012, s * 0.16, s + 0.012), (x + dx, y + dy, s / 2), "WoodDark")
    m.cylinder(0.17, 0.17, 0.42, (x + 0.4, y + 0.32, 0), "WoodDark", segments=8)
    m.cylinder(0.185, 0.185, 0.06, (x + 0.4, y + 0.32, 0.18), "Metal", segments=8)


# --- CI tower (lighthouse) ----------------------------------------------------

CI_BASE = 0.55  # where the shaft starts, on top of its plinth
CI_TOP = 3.4  # where the finished shaft ends and the gallery begins
# The shaft is whitewashed with two broad bands in the status colour.
CI_BANDS = (
    (CI_BASE, 1.25, "Whitewash"),
    (1.25, 1.8, "Status"),
    (1.8, 2.45, "Whitewash"),
    (2.45, 3.0, "Status"),
    (3.0, CI_TOP, "Whitewash"),
)


def ci_radius(z):
    return 0.68 - 0.2 * (z - CI_BASE) / (CI_TOP - CI_BASE)


def ci_plinth(m):
    m.cylinder(0.98, 0.9, 0.3, (0, 0, 0), "StoneDark", segments=10, bevel=0.03)
    m.cylinder(0.8, 0.74, 0.25, (0, 0, 0.3), "Stone", segments=10, bevel=0.02)


def ci_shaft(m, top, jag=0.0):
    """The banded shaft from the plinth up to `top`, optionally left unfinished or snapped. Returns its vertices."""
    verts = []
    for z0, z1, mat in CI_BANDS:
        if z0 >= top:
            break
        z1 = min(z1, top)
        band = m.cylinder(ci_radius(z0), ci_radius(z1), z1 - z0, (0, 0, z0), mat, segments=10)
        if jag and z1 >= top - 1e-6:
            jag_top(m, band, top, jag)
        verts.extend(band)
    return verts


def ci_door(m):
    m.box((0.36, 0.1, 0.52), (0, -0.66, CI_BASE + 0.26), "Wood")
    m.cylinder(0.18, 0.18, 0.1, (0, -0.61, CI_BASE + 0.52), "Wood", segments=10, rot=(math.pi / 2, 0, 0))
    m.box((0.5, 0.14, 0.08), (0, -0.72, CI_BASE - 0.02), "StoneLight")


def ci_pipes(m, full=True):
    """The pipeline itself: a brass main running out of the tower's foot."""
    m.cylinder(0.1, 0.1, 1.0, (0.55, 0.28, 0.42), "Brass", segments=8, rot=(0, math.pi / 2, 0))
    m.cylinder(0.14, 0.14, 0.07, (1.5, 0.28, 0.42), "Metal", segments=8, rot=(0, math.pi / 2, 0))
    m.ico(0.13, (0.62, 0.28, 0.42), "Brass", subdivisions=1)
    if not full:
        return
    m.cylinder(0.08, 0.08, 1.0, (0.62, 0.28, 0.42), "Brass", segments=8)
    m.ico(0.11, (0.62, 0.28, 1.44), "Brass", subdivisions=1)
    m.cylinder(0.14, 0.14, 0.05, (1.05, 0.28, 0.42), "Metal", segments=8, rot=(0, math.pi / 2, 0))
    m.torus(0.15, 0.03, (1.05, 0.28, 0.72), "Metal", segments=10, sides=4, rot=(0, math.pi / 2, 0))
    m.box((0.04, 0.04, 0.3), (1.05, 0.28, 0.6), "Metal")


def ci_cap(m, x, y, z, rot=(0, 0, 0)):
    """The conical roof, in the status colour, with its brass finial."""
    verts = m.cylinder(0.64, 0.0, 0.78, (x, y, z), "Status", segments=8, rot=rot)
    return verts


def ci_tower(seed=21):
    """Built: a banded lighthouse; the lantern glass is the status beacon and the cap wears the status colour."""
    m = Model("tower_ci", seed)
    ci_plinth(m)
    ci_shaft(m, CI_TOP)
    ci_door(m)
    m.box((0.14, 0.08, 0.34), (0, -0.56, 2.15), "Glass")
    m.box((0.08, 0.14, 0.34), (0.55, 0, 2.15), "Glass")
    ci_pipes(m)
    # Gallery with a railing.
    m.cylinder(0.5, 0.78, 0.2, (0, 0, CI_TOP - 0.2), "Stone", segments=10)
    m.cylinder(0.84, 0.84, 0.12, (0, 0, CI_TOP), "StoneDark", segments=10, bevel=0.02)
    for i in range(10):
        a = (i + 0.5) / 10 * math.tau
        m.box((0.05, 0.05, 0.32), (math.cos(a) * 0.78, math.sin(a) * 0.78, CI_TOP + 0.28), "Metal")
    m.torus(0.78, 0.03, (0, 0, CI_TOP + 0.44), "Metal", segments=10, sides=4)
    # Lantern room: glass all round between a metal sill and crown.
    m.cylinder(0.52, 0.52, 0.1, (0, 0, CI_TOP + 0.12), "Metal", segments=8)
    m.cylinder(0.45, 0.45, 0.74, (0, 0, CI_TOP + 0.22), "Beacon", segments=8)
    for i in range(8):
        a = (i + 0.5) / 8 * math.tau
        m.box((0.06, 0.06, 0.76), (math.cos(a) * 0.45, math.sin(a) * 0.45, CI_TOP + 0.59), "Metal", rot=(0, 0, a))
    m.cylinder(0.55, 0.55, 0.08, (0, 0, CI_TOP + 0.96), "Metal", segments=8)
    ci_cap(m, 0, 0, CI_TOP + 1.04)
    m.cylinder(0.035, 0.025, 0.22, (0, 0, CI_TOP + 1.78), "Brass", segments=5)
    m.ico(0.075, (0, 0, CI_TOP + 2.02), "Brass", subdivisions=1)
    return m.build()


def ci_tower_foundation(seed=22):
    """Queued / not yet run: footings, the first course of stones, and the cap waiting on the ground."""
    m = Model("tower_ci_foundation", seed)
    ci_plinth(m)
    for i in range(9):
        if i in (2, 6):
            continue
        a = (i + 0.5) / 9 * math.tau
        m.box((0.36, 0.2, 0.22), (math.cos(a) * 0.56, math.sin(a) * 0.56, CI_BASE + 0.11), "Whitewash", rot=(0, 0, a + math.pi / 2), bevel=0.014)
    stakes(m, 1.3)
    stone_pile(m, 1.1, -0.55)
    plank_stack(m, -1.0, 0.6)
    ci_cap(m, -1.0, -0.8, 0)
    m.cylinder(0.1, 0.1, 0.8, (0.6, 0.95, 0.1), "Brass", segments=8, rot=(0, math.pi / 2, 0.4))
    lamp_post(m, 0.95, 0.3)
    return m.build()


def ci_tower_building(seed=23):
    """Running: the shaft half built inside scaffolding, a block on the hoist, work lanterns lit."""
    m = Model("tower_ci_building", seed)
    ci_plinth(m)
    ci_shaft(m, 2.3, jag=0.16)
    ci_door(m)
    ci_pipes(m, full=False)
    scaffold(m, 1.0, 3.25, levels=(1.05, 1.9, 2.75))
    hoist(m, 0.45, 0.5, 3.3, reach=0.75, load=2.55)
    # A banner on the scaffold in the status colour, facing the viewer on both visible sides.
    m.box((1.0, 0.04, 0.62), (0, -0.95, 2.5), "Status")
    m.box((0.04, 0.9, 0.62), (0.9, 0.05, 1.6), "Status")
    work_lantern(m, -0.72, -0.72, 3.3)
    work_lantern(m, 0.9, -0.6, 2.35)
    stone_pile(m, -1.2, 0.4, count=6)
    return m.build()


def ci_tower_broken(seed=24):
    """Failed: the shaft snapped and leaning, the cap and lantern fallen among rubble, embers glowing."""
    m = Model("tower_ci_broken", seed)
    ci_plinth(m)
    top = 2.1
    stump = ci_shaft(m, top, jag=0.4)
    # A hollow, snapped top: dark inside, broken teeth standing up around the rim.
    r = ci_radius(top)
    stump += m.cylinder(r * 0.8, r * 0.8, 0.06, (0, 0, top - 0.5), "Dark", segments=8)
    for i in range(7):
        a = (i + m.rng.uniform(-0.2, 0.2)) / 7 * math.tau
        h = m.rng.uniform(0.2, 0.6)
        stump += m.box((0.3, 0.14, h), (math.cos(a) * r * 0.92, math.sin(a) * r * 0.92, top - 0.4 + h / 2), "Whitewash", rot=(0, 0, a + math.pi / 2))
    stump += m.box((0.36, 0.1, 0.52), (0, -0.66, CI_BASE + 0.26), "WoodDark")
    m.turn(stump, (0.09, -0.07, 0), pivot=(0, 0, CI_BASE))
    for _ in range(5):
        m.ico(m.rng.uniform(0.09, 0.15), (m.rng.uniform(-0.2, 0.2), m.rng.uniform(-0.2, 0.2), top - 0.4), "Beacon", subdivisions=1, jitter=0.02)
    # The fallen top: the cap on its side, a length of banded shaft, the lantern's frame.
    ci_cap(m, 1.05, -0.7, 0.64, rot=(1.5, 0.0, 0.75))
    m.cylinder(0.5, 0.46, 0.55, (-1.15, -0.45, 0.5), "Status", segments=10, rot=(math.pi / 2, 0, 0.5))
    m.cylinder(0.46, 0.44, 0.3, (-0.88, -0.93, 0.5), "Whitewash", segments=10, rot=(math.pi / 2, 0, 0.5))
    m.torus(0.5, 0.045, (0.35, -1.25, 0.06), "Metal", segments=8, sides=4, arc=math.pi * 1.2, rot=(0.12, 0, 0.3))
    for i in range(4):
        a = m.rng.uniform(0, math.tau)
        m.box((0.06, 0.06, 0.7), (0.45 + math.cos(a) * 0.3, -1.2 + math.sin(a) * 0.3, 0.06), "Metal", rot=(math.pi / 2 - 0.1, 0, a))
    embers(m, 0.4, -1.2, 0.08, 0.3, 6)
    rubble(m, 0.2, -0.3, 1.35, 16)
    # Burst pipe.
    ci_pipes(m, full=False)
    m.cylinder(0.08, 0.08, 0.6, (1.0, 0.75, 0.09), "Brass", segments=8, rot=(0, math.pi / 2, 1.1))
    return m.build()


# --- Release tower (harbour keep with a cargo airship) --------------------------

KEEP_TOP = 2.0  # top of the finished wall, where the battlements start
SHIP_HEADING = math.pi / 4  # the airship lies across the viewer's line of sight, so its full length shows


def keep_plinth(m):
    m.cylinder(1.04, 1.0, 0.3, (0, 0, 0), "StoneDark", segments=12, bevel=0.03)


def keep_body(m, top, jag=0.0):
    verts = m.cylinder(0.86, 0.8, top - 0.3, (0, 0, 0.3), "Limestone", segments=12)
    if jag:
        jag_top(m, verts, top, jag)
    for z in (0.92, 1.5):
        if z + 0.1 < top - jag:
            verts += m.cylinder(0.88, 0.87, 0.1, (0, 0, z), "LimestoneDark", segments=12)
    return verts


def keep_gate(m, mat="Wood"):
    verts = m.box((0.6, 0.12, 0.74), (0, -0.82, 0.3 + 0.37), mat)
    verts += m.cylinder(0.3, 0.3, 0.12, (0, -0.77, 1.04), mat, segments=10, rot=(math.pi / 2, 0, 0))
    for z in (0.52, 0.9):
        verts += m.box((0.64, 0.13, 0.06), (0, -0.83, z), "Metal")
    return verts


def crane(m):
    m.box((0.14, 0.14, 2.0), (1.1, 0.5, 1.0), "Wood")
    m.box((0.9, 0.12, 0.12), (1.4, 0.5, 1.95), "Wood", rot=(0, -0.25, 0))
    m.box((0.08, 0.08, 0.6), (1.1, 0.5, 1.62), "Wood", rot=(0, 0.6, 0))
    m.box((0.03, 0.03, 0.85), (1.75, 0.5, 1.6), "Rope")
    m.box((0.32, 0.32, 0.32), (1.75, 0.5, 1.02), "Wood", bevel=0.02)


def airship(m, x, y, z, length=1.2, girth=0.58, squash=1.0, gondola=True):
    """A cargo airship: the envelope wears the status colour. `squash` below 1 leaves it half inflated."""
    ux, uy = math.cos(SHIP_HEADING), math.sin(SHIP_HEADING)
    m.sphere(1.0, (x, y, z), "Status", segments=14, rings=8, scale=(length, girth, girth * squash), rot=(0, 0, SHIP_HEADING))
    # Canvas bands round the envelope and a brass nose ring.
    for s in (-0.5, 0.0, 0.5):
        r = girth * math.sqrt(1 - s * s) + 0.012
        m.torus(r, 0.035, (x + ux * s * length, y + uy * s * length, z), "Canvas", segments=12, sides=4, rot=(0, math.pi / 2, SHIP_HEADING))
    m.ico(0.11, (x + ux * length, y + uy * length, z), "Brass", subdivisions=1)
    if squash < 1.0:
        return
    # Tail fins: one upright, two level, swept back.
    tx, ty = x - ux * length * 0.86, y - uy * length * 0.86
    fin = [(-0.3, 0), (0.28, 0), (-0.3, 0.5)]
    m.prism(fin, 0.05, (tx, ty, z + 0.12), "Canvas", rot=(0, 0, SHIP_HEADING))
    for side in (-1, 1):
        m.prism(fin, 0.05, (tx, ty, z), "Canvas", rot=(side * math.pi / 2, 0, SHIP_HEADING))
    if gondola:
        gz = z - girth - 0.4
        m.box((0.7, 0.3, 0.22), (x, y, gz), "Wood", rot=(0, 0, SHIP_HEADING), bevel=0.02)
        m.box((0.74, 0.34, 0.06), (x, y, gz + 0.1), "WoodDark", rot=(0, 0, SHIP_HEADING))
        for s in (-0.28, 0.28):
            m.box((0.03, 0.03, 0.42), (x + ux * s, y + uy * s, gz + 0.3), "Rope")


def release_tower(seed=31):
    """Built: the harbour keep with a brazier on its battlements and a cargo airship moored above."""
    m = Model("tower_release", seed)
    keep_plinth(m)
    keep_body(m, KEEP_TOP)
    m.cylinder(0.94, 0.94, 0.16, (0, 0, KEEP_TOP), "LimestoneDark", segments=12, bevel=0.02)
    for i in range(8):
        a = (i + 0.5) / 8 * math.tau
        m.box((0.3, 0.2, 0.3), (math.cos(a) * 0.82, math.sin(a) * 0.82, KEEP_TOP + 0.31), "Limestone", rot=(0, 0, a + math.pi / 2), bevel=0.015)
    keep_gate(m)
    m.box((0.18, 0.08, 0.34), (-0.42, -0.74, 1.45), "Glass", rot=(0, 0, -0.52))
    m.box((0.08, 0.18, 0.34), (0.84, -0.05, 1.3), "Glass")
    # Brazier.
    m.cylinder(0.1, 0.08, 0.3, (0.3, -0.3, KEEP_TOP + 0.16), "Metal", segments=6)
    m.cylinder(0.16, 0.3, 0.2, (0.3, -0.3, KEEP_TOP + 0.46), "Metal", segments=8)
    m.ico(0.26, (0.3, -0.3, KEEP_TOP + 0.82), "Beacon", subdivisions=1, scale=(1, 1, 1.4), jitter=0.04)
    # Mooring mast and the airship tied to it.
    m.cylinder(0.06, 0.045, 1.75, (-0.35, 0.35, KEEP_TOP + 0.16), "Wood", segments=6)
    m.box((0.5, 0.06, 0.06), (-0.2, 0.3, KEEP_TOP + 1.85), "Wood", rot=(0, 0, -0.4))
    airship(m, 0.1, 0.0, 4.6)
    crane(m)
    crates(m, -1.35, -0.75)
    return m.build()


def release_tower_foundation(seed=32):
    """Queued / not yet run: the keep's footing, a mooring post, and the envelope folded on a pallet."""
    m = Model("tower_release_foundation", seed)
    keep_plinth(m)
    for i in range(12):
        if i in (3, 4, 9):
            continue
        a = (i + 0.5) / 12 * math.tau
        m.box((0.36, 0.2, 0.22), (math.cos(a) * 0.76, math.sin(a) * 0.76, 0.41), "Limestone", rot=(0, 0, a + math.pi / 2), bevel=0.014)
    stakes(m, 1.35)
    m.cylinder(0.07, 0.06, 1.3, (0, 0, 0.3), "Wood", segments=6)
    m.torus(0.1, 0.03, (0, 0, 1.45), "Rope", segments=8, sides=4)
    # The envelope, folded and tied, waiting on its pallet.
    m.box((1.0, 0.72, 0.08), (-1.2, -0.85, 0.04), "WoodDark")
    for i, (w, d) in enumerate(((0.92, 0.64), (0.84, 0.58), (0.7, 0.5))):
        m.box((w, d, 0.16), (-1.2, -0.85, 0.16 + i * 0.16), "Status", bevel=0.03)
    for dx in (-0.25, 0.25):
        m.box((0.05, 0.68, 0.5), (-1.2 + dx, -0.85, 0.33), "Rope")
    crates(m, 1.15, -0.55)
    stone_pile(m, 1.0, 0.9, count=8)
    lamp_post(m, -1.2, 0.5)
    return m.build()


def release_tower_building(seed=33):
    """Running: the keep half built in scaffolding, the crane working, the envelope filling above."""
    m = Model("tower_release_building", seed)
    keep_plinth(m)
    keep_body(m, 1.35, jag=0.18)
    keep_gate(m)
    scaffold(m, 1.12, 2.35, levels=(0.8, 1.5, 2.15), posts=8)
    crane(m)
    crates(m, -1.5, -0.6)
    # The envelope half inflated, tethered over the scaffold.
    airship(m, 0.1, 0.0, 3.0, squash=0.55)
    for dx, dy in ((-0.5, -0.45), (0.55, -0.4), (0.5, 0.5), (-0.45, 0.5)):
        m.box((0.03, 0.03, 0.7), (dx, dy, 2.62), "Rope")
    work_lantern(m, -0.8, -0.8, 2.45)
    work_lantern(m, 0.95, -0.7, 1.6)
    stone_pile(m, -1.3, 0.55, count=6)
    return m.build()


def release_tower_broken(seed=34):
    """Failed: the keep cracked open and the airship down, its torn envelope draped over the rubble."""
    m = Model("tower_release_broken", seed)
    keep_plinth(m)
    stump = keep_body(m, 1.55, jag=0.65)
    stump += keep_gate(m, "WoodDark")
    m.turn(stump, (0.06, 0.05, 0), pivot=(0, 0, 0.3))
    # The envelope: deflated and crumpled, slumped from the broken wall across the ground in front.
    m.ico(1.0, (0.62, -0.62, 0.5), "Status", subdivisions=2, scale=(1.15, 0.8, 0.24), rot=(0.25, -0.2, SHIP_HEADING), jitter=0.08)
    m.ico(1.0, (0.3, -0.35, 1.15), "Status", subdivisions=1, scale=(0.6, 0.5, 0.26), rot=(0.7, -0.5, SHIP_HEADING), jitter=0.07)
    for s in (-0.4, 0.3):
        m.box((0.07, 1.4, 0.07), (0.62 + s, -0.62 - s * 0.3, 0.63 + s * 0.12), "Canvas", rot=(0.25, -0.2, SHIP_HEADING))
    # The gondola smashed, the mast snapped, the brazier toppled and still glowing.
    for i in range(5):
        m.box((0.5, 0.08, 0.04), (1.2 + m.rng.uniform(-0.25, 0.25), 0.6 + m.rng.uniform(-0.3, 0.3), 0.03 + i * 0.015), "Wood", rot=(0, 0, m.rng.uniform(0, math.pi)))
    m.cylinder(0.06, 0.045, 1.2, (-1.3, 0.35, 0.07), "Wood", segments=6, rot=(math.pi / 2, 0, 1.2))
    m.cylinder(0.16, 0.3, 0.2, (-1.15, -0.85, 0.22), "Metal", segments=8, rot=(1.3, 0, 0.4))
    embers(m, -1.2, -1.05, 0.05, 0.32, 7)
    embers(m, 0.0, 0.05, 1.15, 0.4, 6)
    rubble(m, 0.1, -0.2, 1.6, 20)
    return m.build()
