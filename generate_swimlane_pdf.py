"""
QAPulse – 8-Beat Milestone Lifecycle Swimlane Diagram (PDF)
Faithfully replicates the dark-themed, glass-card grid design
from presentation_deck.html – landscape A4.
"""

from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.colors import Color, HexColor, white, black
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas
import os

# ─── Page ────────────────────────────────────────────────────────────────────
W, H = landscape(A4)          # 841.89 x 595.28 pts
ML, MR, MT, MB = 14*mm, 12*mm, 14*mm, 12*mm

# ─── Dark palette (matching presentation_deck.html) ─────────────────────────
BG          = HexColor("#0f172a")   # slate-900 background
CARD_BG     = Color(1,1,1, alpha=0.06)
CARD_BORDER = Color(1,1,1, alpha=0.10)
DIVIDER     = Color(1,1,1, alpha=0.05)

# Lane accent colours  (label bg, active card bg, active card border, text)
STYLES = {
    "PMO":  (HexColor("#7c3aed"), HexColor("#2e1065"), HexColor("#7c3aed"), HexColor("#c4b5fd")),  # purple
    "FA":   (HexColor("#6366f1"), HexColor("#1e1b4b"), HexColor("#6366f1"), HexColor("#a5b4fc")),  # indigo
    "DEV":  (HexColor("#06b6d4"), HexColor("#083344"), HexColor("#06b6d4"), HexColor("#67e8f9")),  # cyan
    "QA":   (HexColor("#14b8a6"), HexColor("#042f2e"), HexColor("#14b8a6"), HexColor("#5eead4")),  # teal
    "SYS":  (HexColor("#10b981"), HexColor("#022c22"), HexColor("#10b981"), HexColor("#6ee7b7")),  # emerald
}

PURPLE_300 = HexColor("#c4b5fd")
INDIGO_300 = HexColor("#a5b4fc")
CYAN_300   = HexColor("#67e8f9")
TEAL_300   = HexColor("#5eead4")
TEAL_400   = HexColor("#2dd4bf")
EMERALD_300= HexColor("#6ee7b7")
SLATE_300  = HexColor("#cbd5e1")
SLATE_400  = HexColor("#94a3b8")
SLATE_500  = HexColor("#64748b")
WHITE      = white

# Stage header colours
STG_COLORS = [
    (HexColor("#7c3aed"), HexColor("#2e1065")),  # 1  purple
    (HexColor("#7c3aed"), HexColor("#2e1065")),  # 2  purple
    (HexColor("#6366f1"), HexColor("#1e1b4b")),  # 3  indigo
    (HexColor("#6366f1"), HexColor("#1e1b4b")),  # 4  indigo
    (HexColor("#06b6d4"), HexColor("#083344")),  # 5  cyan
    (HexColor("#14b8a6"), HexColor("#042f2e")),  # 6  teal
    (HexColor("#14b8a6"), HexColor("#042f2e")),  # 7  teal
    (HexColor("#10b981"), HexColor("#022c22")),  # 8  emerald
]
STG_LABELS = [
    ("STAGE 01","Plan"), ("STAGE 02","Specs"), ("STAGE 03","Approval"),
    ("STAGE 04","Build"), ("STAGE 05","Test Auth"), ("STAGE 06","Execute"),
    ("STAGE 07","Retest"), ("STAGE 08","UAT & Go-Live"),
]

# ─── Lane data (mirrors presentation_deck.html grid) ────────────────────────
# Each lane: (key, short, title, subtitle, cells)
# cell = (col_span, type, bold_text, detail_text)
#   type: "active" = glass card with colour, "passive" = italic grey text, "blank"
# col_span values map to proportional widths across 10 content columns (stages 1-8, with 8 being 2 wide)

LANES = [
    ("PMO", "PMO", "PMO / Lead", "Governance & Release", [
        (1, "active", "Open Milestone",          "Scope, dates, env setup."),
        (2, "passive","Monitor Spec Progress & Capacity", ""),
        (1, "passive","Track SPI", ""),
        (3, "passive","Live Defect & Stability Tracking Dashboard", ""),
        (2, "active", "UAT Sign-off & Verdict",  "Exec PDF verdict email, close milestone & log lessons."),
    ]),
    ("FA", "FA", "Functional Analyst", "Requirements & Peer Gate", [
        (1, "passive","Scope Sync", ""),
        (1, "active", "Author Spec",             "Write functional criteria & user stories."),
        (1, "active", "Peer Review",             "Peer FA approves spec.\nZero self-approval."),
        (1, "passive","Provide Spec Context", ""),
        (3, "passive","Clarify Spec Ambiguities if QA/Dev flags discrepancy", ""),
        (2, "passive","UAT Acceptance Verification", ""),
    ]),
    ("DEV", "DEV", "Developer / Lead", "Implementation & Build", [
        (3, "passive","Backlog Grooming & Capacity Review", ""),
        (1, "active", "Build Code",              "Build in context; flip status to 'For QA Test'."),
        (1, "passive","Deploy to SIT", ""),
        (1, "passive","Receive Defect Tickets", ""),
        (1, "active", "Fix Defect",              "Resolve bug & push build for QA retest."),
        (2, "passive","Release Deployment Assist", ""),
    ]),
    ("QA", "QA", "QA Engineer / Lead", "Authoring, Execution & Sign-off", [
        (4, "passive","Environment Setup & Strategy Preparation", ""),
        (1, "active", "Author Tests",            "Pre-author test suites mapped 1:1 to spec criteria."),
        (1, "active", "Execute Tests",           "Run tests per env. Pass/fail step execution."),
        (1, "active", "Retest & Verify",         "Verify dev fixes until 100% pass yield."),
        (2, "active", "Issue QA Verdict",        "Submit final quality report to PMO."),
    ]),
    ("SYS", "SYS", "System & AI Engine", "Automated Governance & Sync", [
        (1, "active", "Redmine Sync",            "Create Redmine version/milestone."),
        (1, "active", "AI Spec Check",           "GenAI checks ambiguity & untestable logic."),
        (1, "active", "RBAC Engine",             "Enforce peer gate & audit log."),
        (1, "active", "Ticket Sync",             "Bi-directional Redmine issue status update."),
        (1, "active", "AI Test Gen",             "Auto-generate edge case test steps."),
        (1, "active", "Auto Defect",             "Failed step auto-creates Redmine defect."),
        (1, "active", "Defect Binding",          "Auto-bind test rerun to Redmine issue."),
        (2, "active", "Audit & Verdict Email",   "Generate immutable PDF log & send HTML O365 verdict email."),
    ]),
]


# ─── Drawing helpers ─────────────────────────────────────────────────────────

def rounded_rect(c, x, y, w, h, r, fill=None, stroke=None, sw=0.6):
    p = c.beginPath()
    p.moveTo(x+r, y);       p.lineTo(x+w-r, y)
    p.arcTo(x+w-r, y,       x+w, y+r, r)
    p.lineTo(x+w, y+h-r);   p.arcTo(x+w, y+h-r, x+w-r, y+h, r)
    p.lineTo(x+r, y+h);     p.arcTo(x+r, y+h, x, y+h-r, r)
    p.lineTo(x, y+r);       p.arcTo(x, y+r, x+r, y, r)
    p.close()
    if fill: c.setFillColor(fill)
    if stroke: c.setStrokeColor(stroke); c.setLineWidth(sw)
    c.drawPath(p, fill=1 if fill else 0, stroke=1 if stroke else 0)


def wrap_text(text, font, size, max_w, c_ref):
    """Simple word-wrap that returns list of lines."""
    words = text.replace("\n"," ").split()
    lines, cur = [], ""
    for w in words:
        test = (cur + " " + w).strip()
        if c_ref.stringWidth(test, font, size) <= max_w:
            cur = test
        else:
            if cur: lines.append(cur)
            cur = w
    if cur: lines.append(cur)
    return lines or [""]


# ─── Main ────────────────────────────────────────────────────────────────────

def generate(out_path):
    c = canvas.Canvas(out_path, pagesize=landscape(A4))
    c.setTitle("QAPulse - 8-Beat Milestone Lifecycle Swimlane")
    c.setAuthor("QAPulse Platform")

    # Background
    c.setFillColor(BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)

    # ── Header banner ────────────────────────────────────────────────────
    banner_h = 28*mm
    banner_y = H - MT - banner_h
    # Gradient-ish banner
    rounded_rect(c, ML, banner_y, W-ML-MR, banner_h, 6,
                 fill=Color(0.08, 0.12, 0.22, alpha=1),
                 stroke=HexColor("#2dd4bf"), sw=0.8)

    # Badge
    badge_x = ML + 5*mm
    badge_y = banner_y + banner_h - 10*mm
    rounded_rect(c, badge_x, badge_y, 52*mm, 5*mm, 2,
                 fill=TEAL_400)
    c.setFont("Helvetica-Bold", 7)
    c.setFillColor(BG)
    c.drawString(badge_x + 2*mm, badge_y + 1.5, "CROSS-FUNCTIONAL SWIMLANE")

    # Sub-badge
    c.setFont("Helvetica", 6.5)
    c.setFillColor(TEAL_300)
    c.drawString(badge_x + 56*mm, badge_y + 1.5, "5 Personas x 8 Lifecycle Beats")

    # Title
    c.setFont("Helvetica-Bold", 14)
    c.setFillColor(WHITE)
    c.drawString(badge_x, banner_y + 5*mm, "Detailed Roles & Automated Governance Swimlane Flow")

    # Status pill (right side)
    pill_w, pill_h = 55*mm, 5.5*mm
    pill_x = W - MR - pill_w - 5*mm
    pill_y = banner_y + banner_h/2 - pill_h/2
    rounded_rect(c, pill_x, pill_y, pill_w, pill_h, 3,
                 fill=Color(0.06, 0.09, 0.16, alpha=1),
                 stroke=Color(1,1,1,alpha=0.1), sw=0.5)
    # Green dot
    c.setFillColor(HexColor("#34d399"))
    c.circle(pill_x + 3*mm, pill_y + pill_h/2, 1.2, fill=1, stroke=0)
    c.setFont("Helvetica", 6)
    c.setFillColor(SLATE_300)
    c.drawString(pill_x + 6*mm, pill_y + 1.5, "Real-time Redmine & AI Sync Active")

    # ── Grid area ────────────────────────────────────────────────────────
    grid_top = banner_y - 4*mm
    grid_bot = MB + 8*mm
    grid_h   = grid_top - grid_bot
    grid_left = ML
    grid_right = W - MR

    label_w = 42*mm   # role/lane column
    content_left = grid_left + label_w + 2*mm
    content_w = grid_right - content_left

    # Stage header bar height
    hdr_h = 11*mm
    hdr_y = grid_top - hdr_h

    # ── Stage column headers ─────────────────────────────────────────────
    # 10 logical columns (stage 8 = 2 cols wide)
    num_cols = 10
    col_gap = 1.5*mm
    total_gap = col_gap * (num_cols - 1)
    col_w = (content_w - total_gap) / num_cols

    def col_x(idx):
        return content_left + idx * (col_w + col_gap)

    # "Role / Lane" header
    rounded_rect(c, grid_left, hdr_y, label_w, hdr_h, 3,
                 fill=Color(1,1,1,alpha=0.03))
    c.setFont("Helvetica-Bold", 6.5)
    c.setFillColor(SLATE_400)
    c.drawString(grid_left + 3*mm, hdr_y + hdr_h/2 - 2, "ROLE / LANE")

    # Stage headers
    stage_col_map = [
        (0, 1), (1, 1), (2, 1), (3, 1), (4, 1), (5, 1), (6, 1), (7, 2),  # stage 8 spans 2
    ]
    ci = 0
    for si, (start_offset, span) in enumerate(stage_col_map):
        sx = col_x(ci)
        sw = col_w * span + col_gap * (span - 1)
        fg, bg_c = STG_COLORS[si]
        rounded_rect(c, sx, hdr_y + 1, sw, hdr_h - 2, 3,
                     fill=bg_c, stroke=Color(1,1,1,alpha=0.05), sw=0.4)
        label, sub = STG_LABELS[si]
        c.setFont("Helvetica-Bold", 6.5)
        c.setFillColor(fg)
        c.drawCentredString(sx + sw/2, hdr_y + hdr_h - 5*mm, label)
        c.setFont("Helvetica", 5.5)
        c.setFillColor(SLATE_400)
        c.drawCentredString(sx + sw/2, hdr_y + hdr_h - 8*mm, sub)
        ci += span

    # ── Swim lanes ───────────────────────────────────────────────────────
    lane_area_top = hdr_y - 2*mm
    num_lanes = 5
    lane_gap = 2*mm
    total_lane_gap = lane_gap * (num_lanes - 1)
    lane_h = (lane_area_top - grid_bot - total_lane_gap) / num_lanes

    for li, (key, short, title, subtitle, cells) in enumerate(LANES):
        accent, card_bg, card_border, txt_col = STYLES[key]
        ly = lane_area_top - (li + 1) * lane_h - li * lane_gap

        # Lane background row
        lane_bg = Color(accent.red, accent.green, accent.blue, alpha=0.06)
        rounded_rect(c, grid_left, ly, grid_right - grid_left, lane_h, 4,
                     fill=lane_bg)

        # Divider line at bottom
        if li < num_lanes - 1:
            c.setStrokeColor(DIVIDER)
            c.setLineWidth(0.3)
            c.line(grid_left, ly, grid_right, ly)

        # ── Label column ─────────────────────────────────────────────────
        # Badge square
        badge_sz = 7*mm
        bx = grid_left + 3*mm
        by = ly + lane_h/2 - badge_sz/2
        label_accent_bg = Color(accent.red, accent.green, accent.blue, alpha=0.2)
        rounded_rect(c, bx, by, badge_sz, badge_sz, 2,
                     fill=label_accent_bg,
                     stroke=Color(accent.red, accent.green, accent.blue, alpha=0.3), sw=0.5)
        c.setFont("Helvetica-Bold", 6)
        c.setFillColor(txt_col)
        tw = c.stringWidth(short, "Helvetica-Bold", 6)
        c.drawString(bx + badge_sz/2 - tw/2, by + badge_sz/2 - 2, short)

        # Title & subtitle
        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(txt_col)
        c.drawString(bx + badge_sz + 2.5*mm, ly + lane_h/2 + 1.5, title)
        c.setFont("Helvetica", 5.5)
        c.setFillColor(SLATE_400)
        c.drawString(bx + badge_sz + 2.5*mm, ly + lane_h/2 - 6, subtitle)

        # ── Cells ────────────────────────────────────────────────────────
        ci = 0  # column index
        cell_pad = 1.5*mm
        for span, ctype, bold_txt, detail_txt in cells:
            cx = col_x(ci)
            cw = col_w * span + col_gap * (span - 1)
            ch = lane_h - 2 * cell_pad
            cy = ly + cell_pad

            if ctype == "active":
                # Glass card with colour
                rounded_rect(c, cx, cy, cw, ch, 3,
                             fill=card_bg,
                             stroke=Color(accent.red, accent.green, accent.blue, alpha=0.35), sw=0.6)

                # Bold title
                c.setFont("Helvetica-Bold", 6.5)
                c.setFillColor(WHITE)
                title_lines = wrap_text(bold_txt, "Helvetica-Bold", 6.5, cw - 3*mm, c)
                ty = cy + ch - 4*mm
                for tl in title_lines:
                    c.drawString(cx + 2*mm, ty, tl)
                    ty -= 7.5

                # Detail text
                if detail_txt:
                    c.setFont("Helvetica", 5.5)
                    c.setFillColor(txt_col)
                    detail_lines = wrap_text(detail_txt, "Helvetica", 5.5, cw - 3*mm, c)
                    ty -= 1
                    for dl in detail_lines:
                        if ty < cy + 1*mm:
                            break
                        c.drawString(cx + 2*mm, ty, dl)
                        ty -= 7

            elif ctype == "passive":
                # Italic grey centred text
                c.setFont("Helvetica-Oblique", 5.5)
                c.setFillColor(SLATE_400)
                p_lines = wrap_text(bold_txt, "Helvetica-Oblique", 5.5, cw - 2*mm, c)
                total_text_h = len(p_lines) * 7
                ty = cy + ch/2 + total_text_h/2 - 5
                for pl in p_lines:
                    tw = c.stringWidth(pl, "Helvetica-Oblique", 5.5)
                    c.drawString(cx + cw/2 - tw/2, ty, pl)
                    ty -= 7

            ci += span

    # ── Footer ───────────────────────────────────────────────────────────
    c.setFont("Helvetica", 5.5)
    c.setFillColor(SLATE_500)
    c.drawString(ML, MB, "QAPulse - AI-Powered Quality Assurance Platform  |  Confidential")
    c.drawRightString(W - MR, MB, "2026 QAPulse  |  All Rights Reserved")

    # ── QAPulse branding top-right ───────────────────────────────────────
    c.setFont("Helvetica-Bold", 8)
    c.setFillColor(TEAL_300)
    c.drawRightString(W - MR - 2*mm, H - MT - 4*mm, "QAPulse")

    c.save()
    print(f"PDF saved -> {out_path}  ({os.path.getsize(out_path):,} bytes)")


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                       "QAPulse_Swimlane_Diagram.pdf")
    generate(out)
