"""
Generate an Excalidraw diagram for EVPN-VXLAN Multi-Tenancy Lab (Eve-NG)
Topology: 2 Spines (RR) + 4 Leafs (VTEP) + 4 Hosts (2 Tenants)
"""
import json
import os

seed_counter = 1000

def next_seed():
    global seed_counter
    seed_counter += 1
    return seed_counter

def rect(id, x, y, w, h, stroke, bg, bound_text_id=None,
         stroke_style="solid", stroke_width=2):
    return {
        "type": "rectangle", "version": 1, "versionNonce": next_seed(),
        "isDeleted": False, "id": id,
        "fillStyle": "solid", "strokeWidth": stroke_width,
        "strokeStyle": stroke_style, "roughness": 0, "opacity": 100,
        "angle": 0, "x": x, "y": y,
        "strokeColor": stroke, "backgroundColor": bg,
        "width": w, "height": h, "seed": next_seed(),
        "groupIds": [], "frameId": None,
        "roundness": {"type": 3},
        "boundElements": [{"type": "text", "id": bound_text_id}] if bound_text_id else [],
        "updated": 1709578029000, "link": None, "locked": False
    }

def txt(id, x, y, w, h, content, font_size=14, container_id=None,
        stroke="#1e1e1e", text_align="center", v_align="middle"):
    return {
        "type": "text", "version": 1, "versionNonce": next_seed(),
        "isDeleted": False, "id": id,
        "fillStyle": "solid", "strokeWidth": 1, "strokeStyle": "solid",
        "roughness": 0, "opacity": 100, "angle": 0,
        "x": x, "y": y,
        "strokeColor": stroke, "backgroundColor": "transparent",
        "width": w, "height": h, "seed": next_seed(),
        "groupIds": [], "frameId": None, "roundness": None,
        "boundElements": [], "updated": 1709578029000,
        "link": None, "locked": False,
        "fontSize": font_size, "fontFamily": 1,
        "text": content, "textAlign": text_align, "verticalAlign": v_align,
        "containerId": container_id, "originalText": content,
        "lineHeight": 1.25
    }

def ln(id, x, y, pts, stroke="#343a40", stroke_style="solid", stroke_width=2):
    return {
        "type": "line", "version": 1, "versionNonce": next_seed(),
        "isDeleted": False, "id": id,
        "fillStyle": "solid", "strokeWidth": stroke_width,
        "strokeStyle": stroke_style, "roughness": 0, "opacity": 100,
        "angle": 0, "x": x, "y": y,
        "strokeColor": stroke, "backgroundColor": "transparent",
        "width": abs(pts[1][0]) if len(pts) > 1 else 0,
        "height": abs(pts[1][1]) if len(pts) > 1 else 0,
        "seed": next_seed(),
        "groupIds": [], "frameId": None,
        "roundness": {"type": 2},
        "boundElements": [], "updated": 1709578029000,
        "link": None, "locked": False,
        "startBinding": None, "endBinding": None,
        "lastCommittedPoint": None,
        "startArrowhead": None, "endArrowhead": None,
        "points": pts
    }

# ── Build Elements ──────────────────────────────────────────────────────
elements = []

# ── Title ───────────────────────────────────────────────────────────────
elements.append(txt("title", 250, 12, 620, 40,
    "EVPN-VXLAN Multi-Tenancy Lab  (Eve-NG)", 28, v_align="top"))

# ── VXLAN Overlay Indicator ────────────────────────────────────────────
elements.append(rect("overlay", 15, 222, 1140, 58,
    "#4dabf7", "#edf2ff", "overlay_t", "dashed", 2))
elements.append(txt("overlay_t", 160, 234, 780, 20,
    "VXLAN Overlay Fabric  \u2014  BGP EVPN Control Plane  \u2014  Ingress Replication",
    14, container_id="overlay"))

# ── Spine Switches ─────────────────────────────────────────────────────
elements.append(rect("spine1", 270, 82, 210, 90,
    "#1971c2", "#a5d8ff", "spine1_t"))
elements.append(txt("spine1_t", 295, 92, 160, 55,
    "SPINE-1 (RR)\nLo0: 10.0.0.1/32\nAS 65000", 14, container_id="spine1"))

elements.append(rect("spine2", 720, 82, 210, 90,
    "#1971c2", "#a5d8ff", "spine2_t"))
elements.append(txt("spine2_t", 745, 92, 160, 55,
    "SPINE-2 (RR)\nLo0: 10.0.0.2/32\nAS 65000", 14, container_id="spine2"))

# ── Leaf Switches ──────────────────────────────────────────────────────
leaf_data = [
    ("leaf1",  30, "LEAF-1",  "10.0.1.11", "10.0.0.11"),
    ("leaf2", 310, "LEAF-2",  "10.0.1.12", "10.0.0.12"),
    ("leaf3", 620, "LEAF-3",  "10.0.1.13", "10.0.0.13"),
    ("leaf4", 920, "LEAF-4",  "10.0.1.14", "10.0.0.14"),
]
for lid, lx, name, vtep, lo0 in leaf_data:
    tid = f"{lid}_t"
    elements.append(rect(lid, lx, 310, 200, 88,
        "#2f9e44", "#b2f2bb", tid))
    elements.append(txt(tid, lx + 20, 320, 160, 55,
        f"{name}\nVTEP: {vtep}/32\nLo0: {lo0}/32",
        14, container_id=lid))

# ── Hosts ──────────────────────────────────────────────────────────────
host_data = [
    ("ha1",  40, "HOST-A1",  "Tenant-A  |  VLAN 10", "192.168.10.10", "#e67700", "#ffec99"),
    ("hb1", 320, "HOST-B1",  "Tenant-B  |  VLAN 20", "192.168.20.10", "#6741d9", "#d0bfff"),
    ("ha2", 630, "HOST-A2",  "Tenant-A  |  VLAN 10", "192.168.10.20", "#e67700", "#ffec99"),
    ("hb2", 930, "HOST-B2",  "Tenant-B  |  VLAN 20", "192.168.20.20", "#6741d9", "#d0bfff"),
]
for hid, hx, name, tenant, ip, sc, bg in host_data:
    tid = f"{hid}_t"
    elements.append(rect(hid, hx, 555, 180, 72, sc, bg, tid))
    elements.append(txt(tid, hx + 20, 562, 140, 52,
        f"{name}\n{tenant}\n{ip}", 13, container_id=hid))

# ── Spine-to-Leaf Lines ───────────────────────────────────────────────
# Spine-1 bottom-center: (375, 172)   Spine-2 bottom-center: (825, 172)
# Leaf top-centers: L1=130, L2=410, L3=720, L4=1020  (all y=310)
s1x, s2x, sy = 375, 825, 172
leaf_top_cx = [130, 410, 720, 1020]
ly = 310

for i, lc in enumerate(leaf_top_cx):
    elements.append(ln(f"s1l{i+1}", s1x, sy, [[0, 0], [lc - s1x, ly - sy]]))
    elements.append(ln(f"s2l{i+1}", s2x, sy, [[0, 0], [lc - s2x, ly - sy]]))

# ── Leaf-to-Host Lines ────────────────────────────────────────────────
leaf_bot_y = 398
host_top_y = 555
for i, lc in enumerate(leaf_top_cx):
    elements.append(ln(f"lh{i+1}", lc, leaf_bot_y,
        [[0, 0], [0, host_top_y - leaf_bot_y]]))

# ── Spine-to-Spine iBGP RR Peering (dashed) ──────────────────────────
elements.append(ln("s1s2", 480, 127, [[0, 0], [240, 0]],
    "#1971c2", "dashed", 2))
elements.append(txt("ibgp_lbl", 540, 106, 120, 18,
    "iBGP RR \u2194 RR", 12, stroke="#1971c2"))

# ── Underlay Label ────────────────────────────────────────────────────
elements.append(txt("ulay_lbl", 360, 445, 420, 20,
    "Underlay: OSPF Area 0  |  P2P /31 Links  |  MTU 9216",
    13, stroke="#868e96"))

# ── P2P Link Labels (small, near spine-leaf connections) ──────────────
# Spine-1 side labels
p2p_labels = [
    ("p2p_s1l1", 200, 200, "10.1.1.0/31"),
    ("p2p_s1l2", 380, 200, "10.1.1.2/31"),
    ("p2p_s1l3", 500, 200, "10.1.1.4/31"),
    ("p2p_s1l4", 650, 200, "10.1.1.6/31"),
    ("p2p_s2l1", 350, 290, "10.1.2.0/31"),
    ("p2p_s2l2", 500, 290, "10.1.2.2/31"),
    ("p2p_s2l3", 750, 290, "10.1.2.4/31"),
    ("p2p_s2l4", 900, 200, "10.1.2.6/31"),
]
for pid, px, py, label in p2p_labels:
    elements.append(txt(pid, px, py, 90, 14, label, 10, stroke="#adb5bd"))

# ── Legend ─────────────────────────────────────────────────────────────
elements.append(rect("legend", 810, 660, 350, 100,
    "#868e96", "#f8f9fa", stroke_width=1))
elements.append(txt("leg_title", 830, 668, 100, 18,
    "Legend", 15, stroke="#495057", text_align="left"))

# Tenant-A swatch + label
elements.append(rect("tena_sw", 830, 695, 18, 18, "#e67700", "#ffec99"))
elements.append(txt("tena_lbl", 858, 695, 280, 18,
    "Tenant-A (VRF TENANT-A) \u2014 192.168.10.0/24",
    12, stroke="#1e1e1e", text_align="left"))

# Tenant-B swatch + label
elements.append(rect("tenb_sw", 830, 722, 18, 18, "#6741d9", "#d0bfff"))
elements.append(txt("tenb_lbl", 858, 722, 280, 18,
    "Tenant-B (VRF TENANT-B) \u2014 192.168.20.0/24",
    12, stroke="#1e1e1e", text_align="left"))

# ── Protocol label ────────────────────────────────────────────────────
elements.append(txt("proto_lbl", 20, 660, 400, 40,
    "Protocols: OSPF (underlay) + BGP EVPN (overlay)\n"
    "Encap: VXLAN  |  Replication: Ingress  |  GW: Anycast",
    12, stroke="#868e96", text_align="left", v_align="top"))

# ── Assemble Document ─────────────────────────────────────────────────
doc = {
    "type": "excalidraw",
    "version": 2,
    "source": "https://excalidraw.com",
    "elements": elements,
    "appState": {
        "gridSize": None,
        "viewBackgroundColor": "#ffffff"
    },
    "files": {}
}

# ── Write Output ──────────────────────────────────────────────────────
output_path = os.path.join(os.path.dirname(__file__), "evpn-vxlan-lab.excalidraw")
with open(output_path, "w", encoding="utf-8") as f:
    json.dump(doc, f, indent=2)

print(f"Created: {output_path}")
print(f"Total elements: {len(elements)}")
