# 第三方檔案

| 檔案 | 來源 | 授權 |
| --- | --- | --- |
| `pdf-lib.min.js` | [pdf-lib](https://github.com/Hopding/pdf-lib) 1.17.1 | MIT |
| `fontkit.umd.min.js` | [@pdf-lib/fontkit](https://github.com/Hopding/fontkit) 1.1.1 | MIT |
| `hb-subset.wasm` | [harfbuzzjs](https://github.com/harfbuzz/harfbuzzjs) 0.4.15 | MIT |
| `../fonts/NotoSansTC-Regular.ttf` | [Noto Sans CJK](https://github.com/notofonts/noto-cjk) Sans2.004 繁中子集，轉成 TrueType 輪廓（`tools/make_pdf_font.py`） | SIL OFL 1.1（`../fonts/OFL.txt`） |

## 為什麼字型要自己轉、自己裁

pdf-lib 內建的字型子集化（`subset: true`）遇到中文大字型會產出壞檔：
poppler 會拿系統字型頂替所以看起來正常，但 pdf.js（Firefox）與部分閱讀器會掉一半的字。
CFF 輪廓的 OTF 即使不裁切，pdf-lib 嵌進去也會壞。

所以 PDF 的做法是：

1. 用 TrueType 輪廓的字型（從官方 OTF 轉出來）
2. 先用 HarfBuzz（`hb-subset.wasm`）裁出文件裡用到的字，並拿掉 GSUB/GPOS/GDEF：
   fontkit 排英數字時會換成替代字形，那組字形在 PDF 裡字寬不對（「64x78」變成「6 4 x7 8」）
3. 再交給 pdf-lib 整套嵌入（`subset: false`）

一份文件的字型通常只有幾十 KB。
