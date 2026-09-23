#!/usr/bin/env python3
"""社群分享圖：site/assets/og.png（1200×630）

牛皮紙紙箱底、麥克筆主標，右下貼一張範例屋閱讀角的狗（Carl Larsson《閒適的角落》局部）。

    python3 tools/make_og.py
"""
import os
import tempfile
import urllib.request

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "site", "assets", "og.png")
DOG = os.path.join(ROOT, "demo", "images", "src", "reading-layout-01.jpg")
# 粉圓（Huninn），與網站標題同一套字
FONT_URL = "https://fonts.gstatic.com/s/huninn/v8/OpNNnoINg9bQ4xkpjg.ttf"

W, H = 1200, 630
KRAFT = (201, 164, 122)
INK = (35, 32, 27)
TAPE = (240, 232, 208, 225)


def font(path, size):
    return ImageFont.truetype(path, size)


def main():
    tmp = os.path.join(tempfile.gettempdir(), "huninn-og.ttf")
    if not os.path.exists(tmp):
        urllib.request.urlretrieve(FONT_URL, tmp)

    im = Image.new("RGB", (W, H), KRAFT)
    d = ImageDraw.Draw(im, "RGBA")
    # 瓦楞紙細直紋
    for x in range(0, W, 9):
        d.rectangle((x, 0, x + 1, H), fill=(0, 0, 0, 8))

    # 主標：微微傾斜，像寫在紙箱上
    text = Image.new("RGBA", (W, 330), (0, 0, 0, 0))
    td = ImageDraw.Draw(text)
    big = font(tmp, 76)
    td.text((0, 10), "想要我的家當嗎？", font=big, fill=INK)
    td.text((0, 118), "全部都放在這裡了！", font=big, fill=INK)
    text = text.rotate(1.2, resample=Image.BICUBIC, expand=False)
    im.paste(text, (72, 70), text)

    d.text((76, 34), "我想搬出去！", font=font(tmp, 30), fill=INK)
    d.text((76, 560), "great-moving-era.ddio.io", font=font(tmp, 26), fill=(74, 65, 51))

    # 拍立得：狗
    src = Image.open(DOG).convert("RGB")
    w, h = src.size
    dog = src.crop((int(0.02 * w), int(0.70 * h), int(0.50 * w), int(0.99 * h)))
    dog = dog.resize((480, int(480 * dog.height / dog.width)), Image.LANCZOS)
    pad, bottom = 16, 58
    card = Image.new("RGBA", (dog.width + pad * 2, dog.height + pad + bottom), (255, 255, 255, 255))
    card.paste(dog, (pad, pad))
    cd = ImageDraw.Draw(card)
    cd.text((pad + 4, dog.height + pad + 10), "狗不用搬", font=font(tmp, 30), fill=INK)
    card = card.rotate(-4, resample=Image.BICUBIC, expand=True)

    shadow = Image.new("RGBA", card.size, (0, 0, 0, 0))
    shadow.paste((0, 0, 0, 70), (0, 0), card)
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    x, y = W - card.width - 56, H - card.height - 28
    im.paste(shadow, (x + 8, y + 12), shadow)
    im.paste(card, (x, y), card)

    # 封箱膠帶貼住拍立得上緣
    tape = Image.new("RGBA", (190, 44), TAPE)
    tape = tape.rotate(8, resample=Image.BICUBIC, expand=True)
    im.paste(tape, (x + card.width // 2 - 95, y - 18), tape)

    im.save(OUT, optimize=True)
    print("✓", os.path.relpath(OUT, ROOT), os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
