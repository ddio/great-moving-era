#!/usr/bin/env python3
"""產生線上編輯器 PDF 用的字型：site/edit/fonts/NotoSansTC-Regular.ttf

Noto Sans CJK 官方只提供 CFF 輪廓的 OTF，但 pdf-lib 嵌入 CFF 字型會產出壞檔
（見 site/edit/vendor/README.md），所以轉成 TrueType 輪廓。

    python3 -m venv /tmp/ft && /tmp/ft/bin/pip install fonttools
    /tmp/ft/bin/python tools/make_pdf_font.py
"""
import os
import urllib.request

from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont, newTable

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = ("https://cdn.jsdelivr.net/gh/notofonts/noto-cjk@Sans2.004/"
       "Sans/SubsetOTF/TC/NotoSansTC-Regular.otf")
DST = os.path.join(ROOT, "site", "edit", "fonts", "NotoSansTC-Regular.ttf")


def main():
    tmp = DST + ".otf"
    print("下載", SRC)
    urllib.request.urlretrieve(SRC, tmp)
    font = TTFont(tmp)
    glyphs = font.getGlyphSet()

    glyf = newTable("glyf")
    glyf.glyphOrder = font.getGlyphOrder()
    glyf.glyphs = {}
    for name in glyf.glyphOrder:
        pen = TTGlyphPen(glyphs)
        # 三次曲線轉二次，誤差 1 個字型單位（1/1000 em）
        glyphs[name].draw(Cu2QuPen(pen, 1.0, reverse_direction=True))
        glyf[name] = pen.glyph()
    font["glyf"] = glyf
    font["loca"] = newTable("loca")

    maxp = font["maxp"]
    maxp.tableVersion = 0x00010000
    for key in ("maxTwilightPoints", "maxStorage", "maxFunctionDefs", "maxInstructionDefs",
                "maxStackElements", "maxSizeOfInstructions", "maxComponentElements",
                "maxComponentDepth"):
        setattr(maxp, key, 0)
    maxp.maxZones = 1
    font["post"].formatType = 3.0
    for tag in ("CFF ", "VORG"):
        if tag in font:
            del font[tag]
    font.sfntVersion = "\x00\x01\x00\x00"
    font.save(DST)
    os.remove(tmp)
    print("✓", os.path.relpath(DST, ROOT), f"{os.path.getsize(DST) / 1048576:.1f} MB")


if __name__ == "__main__":
    main()
