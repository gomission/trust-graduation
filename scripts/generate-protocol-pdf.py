#!/usr/bin/env python3

from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import ListFlowable, ListItem, PageBreak, Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
OUT = DOCS / "pdf"
SOURCES = [
    ROOT / "README.md",
    DOCS / "spec-overview.md",
    DOCS / "spec-deep-dive.md",
    DOCS / "receipts-forward-design.md",
    DOCS / "adoption-roadmap.md",
    DOCS / "github-npm-publishing.md",
]


def clean(text):
    text = str(text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<b>\1</b>", text)
    return text


def make_styles():
    base = getSampleStyleSheet()
    return {
        "cover": ParagraphStyle("Cover", parent=base["Title"], fontName="Helvetica-Bold", fontSize=30, leading=34, spaceAfter=12, textColor=colors.HexColor("#111111"), alignment=TA_LEFT),
        "title": ParagraphStyle("Title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=23, leading=27, spaceAfter=13, textColor=colors.HexColor("#111111"), alignment=TA_LEFT),
        "h1": ParagraphStyle("H1", parent=base["Heading1"], fontName="Helvetica-Bold", fontSize=16, leading=20, spaceBefore=12, spaceAfter=7, textColor=colors.HexColor("#111111")),
        "h2": ParagraphStyle("H2", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, leading=15, spaceBefore=9, spaceAfter=5, textColor=colors.HexColor("#222222")),
        "body": ParagraphStyle("Body", parent=base["BodyText"], fontName="Helvetica", fontSize=9.3, leading=13, spaceAfter=6, textColor=colors.HexColor("#333333")),
        "bullet": ParagraphStyle("Bullet", parent=base["BodyText"], fontName="Helvetica", fontSize=8.8, leading=11.6, leftIndent=10, textColor=colors.HexColor("#333333")),
        "code": ParagraphStyle("Code", parent=base["BodyText"], fontName="Courier", fontSize=7.5, leading=9.2, textColor=colors.HexColor("#555555"), spaceAfter=8),
    }


ST = make_styles()


def page(canvas, doc):
    canvas.saveState()
    x = doc.leftMargin
    y = letter[1] - 0.34 * inch
    canvas.setFillColor(colors.HexColor("#6382ff"))
    canvas.circle(x + 4, y + 1, 4, stroke=0, fill=1)
    canvas.setFillColor(colors.HexColor("#111111"))
    canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(x + 14, y - 3, "trust graduation")
    canvas.setFillColor(colors.HexColor("#777777"))
    canvas.setFont("Helvetica", 7.5)
    canvas.drawRightString(letter[0] - doc.rightMargin, y - 3, "Protocol docs")
    canvas.setStrokeColor(colors.HexColor("#dddddd"))
    canvas.line(doc.leftMargin, y - 13, letter[0] - doc.rightMargin, y - 13)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(colors.HexColor("#777777"))
    canvas.drawString(doc.leftMargin, 0.35 * inch, "Trust Graduation")
    canvas.drawRightString(letter[0] - doc.rightMargin, 0.35 * inch, f"Page {doc.page}")
    canvas.restoreState()


def markdown_to_flow(path):
    lines = path.read_text().splitlines()
    flow = []
    bullets = []
    in_fence = False
    fence = []

    def flush_bullets():
        nonlocal bullets
        if not bullets:
            return
        flow.extend([Paragraph(f"- {clean(item)}", ST["bullet"]) for item in bullets])
        flow.append(Spacer(1, 3))
        bullets = []

    for raw in lines:
        line = raw.rstrip()
        if line.startswith("```"):
            if in_fence:
                flow.append(Paragraph(clean(" / ".join(fence)), ST["code"]))
                fence = []
                in_fence = False
            else:
                flush_bullets()
                in_fence = True
            continue
        if in_fence:
            if line:
                fence.append(line)
            continue
        if not line:
            flush_bullets()
            flow.append(Spacer(1, 3))
            continue
        if line.startswith("# "):
            flush_bullets()
            flow.append(Paragraph(clean(line[2:]), ST["title"]))
        elif line.startswith("## "):
            flush_bullets()
            flow.append(Paragraph(clean(line[3:]), ST["h1"]))
        elif line.startswith("### "):
            flush_bullets()
            flow.append(Paragraph(clean(line[4:]), ST["h2"]))
        elif line.startswith("- "):
            bullets.append(line[2:])
        elif re.match(r"^\d+\. ", line):
            bullets.append(re.sub(r"^\d+\. ", "", line))
        else:
            flush_bullets()
            flow.append(Paragraph(clean(line), ST["body"]))
    flush_bullets()
    return flow


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    output = OUT / "trust-graduation-protocol.pdf"
    doc = SimpleDocTemplate(
        str(output),
        pagesize=letter,
        rightMargin=0.55 * inch,
        leftMargin=0.55 * inch,
        topMargin=0.72 * inch,
        bottomMargin=0.62 * inch,
        title="Trust Graduation Protocol",
    )
    flow = [
        Spacer(1, 0.4 * inch),
        Paragraph("trust graduation", ParagraphStyle("Logo", parent=ST["cover"], fontSize=16, leading=18, textColor=colors.HexColor("#6382ff"), spaceAfter=18)),
        Paragraph("Trust Graduation Protocol", ST["cover"]),
        Paragraph("GitHub, npm, protocol, schema, and roadmap documentation packet.", ST["body"]),
        PageBreak(),
    ]
    for index, source in enumerate(SOURCES):
        if index:
            flow.append(PageBreak())
        flow.extend(markdown_to_flow(source))
    doc.build(flow, onFirstPage=page, onLaterPages=page)
    print(output)


if __name__ == "__main__":
    main()
