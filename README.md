# 我想搬出去！

> 想要我的家當嗎？全部都放在這裡了！

給搬家公司線上估價用的單頁說明：搬運條件、大型家具、各房間文字說明與照片。
搬家公司看了就能報價，不用一家一家約看屋。

- 網站：<https://great-moving-era.ddio.io/>
- 線上編輯器：<https://great-moving-era.ddio.io/edit/>，不用安裝任何東西，
  資料只存在使用者自己的瀏覽器
- 範例屋：<https://great-moving-era.ddio.io/demo/>

這個 repo 有兩種用法：

| | 誰用 | 怎麼用 |
| --- | --- | --- |
| **線上編輯器** | 一般人 | 開網頁、拖照片、下載 PDF 或網站檔 |
| **命令列流程** | 會用終端機的人 | 編輯 YAML、跑 Python，見下方「命令列流程」 |

兩者產出同一種網站：`index.html` + `assets/` + `data/data.js` + `images/`。
編輯器下載的網站檔可以直接放上網路，也能再匯入編輯器；CLI 專案資料夾也能匯入編輯器。

## 網站（GitHub Pages）

```
site/                  landing、分享教學、404、共用樣式
site/edit/             線上編輯器（原生 ES modules，不需要 build）
  js/app.js            表單、照片、自動儲存、預覽、下載
  js/model.js          編輯器專案格式 <-> window.MOVE_DATA（與 build.py 產出相同）
  js/images.js         照片處理：tools/images.py 的瀏覽器版
  js/store.js          IndexedDB
  js/zip.js            zip 讀寫（不靠套件）
  js/io.js             下載網站檔、匯入 zip／資料夾／範例屋
  js/pdf.js            PDF 產生
  vendor/、fonts/      pdf-lib、fontkit、HarfBuzz、Noto Sans TC（見 vendor/README.md）
demo/                  範例屋：YAML + 公有領域名畫（出處見 demo/CREDITS.md）
tools/build_site.py    組出 _site/：site/ + viewer 本體（/viewer/）+ 範例屋（/demo/）
.github/workflows/     推 main 就跑 build_site.py 並發佈
```

本機預覽：

```bash
python3 tools/build_site.py --serve     # http://127.0.0.1:8778/
```

- `index.html`、`assets/` 是網頁本體，CLI 與編輯器共用同一份；
  編輯器預覽與下載網站檔時抓的是 `/viewer/` 底下的這份
- 流量統計用 GoatCounter（great-moving-era.goatcounter.com），
  只注入本站頁面；`/viewer/` 與使用者下載的網站不帶統計
- 編輯器照片處理：canvas 重新編碼（清掉 EXIF／GPS）、依拍攝方向轉正、
  長邊 3000／1000px；PNG 維持 PNG
- 編輯器 PDF：pdf-lib 自己排版，縮圖 JPEG 原封不動嵌入。
  字型要先用 HarfBuzz 裁過再嵌入，原因見 `site/edit/vendor/README.md`；
  字型檔由 `tools/make_pdf_font.py` 產生

---

# 命令列流程

## 資料流

```
content/site.yaml ──build.py──────> data/data.js ──> index.html
images/src/*  ──tools/images.py──┬─> images/full/    長邊 3000px、q75
                                 └─> images/thumb/   長邊 1000px、q78
```

**你只需要編輯 `content/site.yaml` 與把原始照片放到 `images/src/`。**

第一次使用：`cp content/site.example.yaml content/site.yaml`，
或用 `python3 tools/scaffold.py -o content/site.yaml` 依現有照片直接產出待填骨架。

## 什麼會進 git

| 進版控 | 不進版控（`.gitignore`） |
| --- | --- |
| 程式碼、README | `content/site.yaml` — 實際地址、電話、屋況 |
| `content/site.example.yaml` — 空白範本 | `data/data.js` — 由上者產生，內容相同 |
| | `images/` — 原始照片與所有產生出來的圖片 |

個資與照片只留在你自己的機器上，部署時由 surge 直接上傳工作目錄。

## 日常流程

```bash
# 1. 把原始照片放進 images/src/，檔名格式：<房間>-<類型>-<編號>.jpg
#    類型為 layout（大格局）或 detail（細節）；整體平面圖用 overview-plan-01.jpg
# 2. 依照片產生待填的 site.yaml 骨架（第一次或大量加照片後）
python3 tools/scaffold.py -o content/site.yaml
# 　　接著編輯 content/site.yaml 填文字與圖說
# 3. 開發（改檔自動 build、瀏覽器自動更新）
python3 tools/dev.py           # 開 http://localhost:8777
```

要出貨前產生一次完整檔案：`./build.sh`

`build.sh` 會檢查：

- YAML 宣告了但檔案不存在 → **錯誤**，中止
- 檔案存在但 YAML 沒提到 → 警告（提醒你補圖說）
- 缺縮圖 → 警告

## 開發 server

```bash
python3 tools/dev.py             # 預設 127.0.0.1:8777
python3 tools/dev.py --port 3000
```

| 改動 | 行為 |
| --- | --- |
| `assets/style.css` | 熱抽換樣式，不重整、不跳位 |
| `content/site.yaml` | 跑 `build.py` → 重整（保留捲動位置） |
| `images/src/*` | 跑 `images.py`（增量）+ `build.py` → 重整 |
| `assets/app.js`、`index.html` | 重整 |

build 失敗時錯誤會直接蓋在畫面上，修好即自動消失；server 重啟後瀏覽器會自己接回來。
開發用腳本由 server 即時注入，不會寫進 `index.html`，部署出去的檔案是乾淨的。

## YAML 重點

| 項目 | 寫法 |
| --- | --- |
| 說明文字 | `notes:` 底下一行一個 bullet；要子項就寫 `標題:` 再縮排列出 |
| 圖片 | `layout:` / `detail:` 底下**只寫圖說**，檔名依順序自動組成 |
| 指定編號 | 寫成 `- 5: 圖說` → `<房間>-<類型>-05.jpg`，之後接續 06 |
| 不寫圖說 | 冒號後面留空，頁面只顯示編號 |
| 整區不寫圖說 | 整個區塊寫成一行 `layout: auto`，該類照片全部自動帶入 |
| 大型家具 | 最外層 `furniture:`，不分房間；一項寫 `名稱` 或 `[名稱, 尺寸, 附註]` |

圖說中若要用半形冒號，請用引號包起來：`- "抽屜: 線材"`。

## 頁面功能

- **縮圖**：頁面一律顯示縮圖（長邊 1000px）加快開啟
- **點圖放大**：一律載入原圖，可用 ← → 或手機左右滑切換、Esc 關閉
- **細節照片**：桌機預設展開、手機預設收合
- **列印**：按鈕會先載入所有照片才叫出列印，避免印出空白圖；
  每個房間自動分頁，照片兩欄排列、不裁切
- **大型家具**：最外層 `furniture:` 列成一張表，紙箱與零碎物品讓搬家公司看照片評估

## 圖片處理

原始檔放 `images/src/`，其餘兩個目錄由 `tools/images.py` 產生，不要手動改：

| 目錄 | 內容 | 用途 |
| --- | --- | --- |
| `images/src/` | 你給的原始檔（不進 git） | 母檔，只留在你機器上 |
| `images/full/` | 長邊 3000px、JPEG q75 | 點圖放大（燈箱）|
| `images/thumb/` | 長邊 1000px、JPEG q78 | 網頁顯示與列印 |

列印版面每張照片最多 89mm 寬，1000px 換算是 285–374 DPI，已是印刷品質；
餵 3000px 給印表機只會讓 PDF 肥好幾倍，畫質看不出差別。

每張圖都會：

- **移除全部 EXIF，包含 GPS 定位**（連拍攝器材、時間都不會留下）
- 依原始方向自動轉正，手機直拍不會躺著
- 帶 ICC 色彩描述（iPhone 多為 Display P3）者先轉成 sRGB，避免拔掉描述檔後顏色跑掉
- PNG 原始檔維持 PNG 輸出並保留透明背景，其餘轉 JPEG
- 原圖色數在 256 色以內的 PNG（平面圖、線稿）輸出為索引色，檔案小很多
- 輸出超過 1.5MB 會提醒——照片類的原始檔請存成 JPEG，PNG 適合線稿

`images.py` 是增量的：只處理新的或改過的檔案，原始檔刪掉時會一併清除對應輸出。
要全部重做用 `python3 tools/images.py --force`。

iPhone 的 `.HEIC` 目前不支援，請先轉成 JPEG（工具會列出被跳過的檔案）。

## 依照片產生 YAML 骨架

```bash
python3 tools/scaffold.py                        # 先印出來看
python3 tools/scaffold.py -o content/site.yaml   # 寫入（不覆蓋既有檔案）
python3 tools/scaffold.py -o content/site.yaml --force
python3 tools/scaffold.py --auto                 # 不逐張列，改用 auto
```

掃描 `images/src/`，依檔名分好房間與 layout／detail，列出每張照片的編號讓你填圖說：

```yaml
  - id: 廚房
    name: 廚房
    layout:
      - 1:                 # 對應 images/src/廚房-layout-01.jpg
      - 2:
```

完全不打算寫圖說的話用 `--auto`，圖片區塊只會是一行 `layout: auto`，
之後加減照片都不用再動 YAML。

**不會合併既有的 `content/site.yaml`**，`--force` 會整個蓋掉，重跑前請自行備份。
平常新增照片不需要重跑：`build.py` 會警告哪些照片還沒寫進 YAML。

房間名可以用中文（會出現在檔名與網址上，瀏覽器會自動編碼）；
空白與 `/ \ ? # % : * " < > |` 不能用。

## 產生要寄出去的 PDF

```bash
python3 tools/make_pdf.py                  # 輸出 <標題>.pdf
python3 tools/make_pdf.py -o 給XX搬家.pdf
python3 tools/make_pdf.py --compress       # 再用 ghostscript 壓一次
```

**不要用瀏覽器的列印對話框存 PDF。** 對話框的縮放只要不是 100%，
Chrome 就會把每張照片重新取樣成無損點陣圖，同一份內容會從 5MB 變成 440MB。
這支工具走無頭瀏覽器，照片以 JPEG 直通寫入，實測 63 張照片約 5MB。

頁面上的「列印」按鈕仍然可以直接印到紙上——送印表機時檔案大小無所謂。

## 部署

```bash
python3 tools/publish.py --domain xxxx.surge.sh   # 第一次，網域記在 .surge-domain
python3 tools/publish.py                          # 之後沿用同一個網域
python3 tools/publish.py --dry-run                # 只產 dist/，不上傳
```

**不要用 `surge .`**。工作目錄裡有不能公開的東西：`images/src/`（原始照片，約 180MB）、
`content/site.yaml`（未經整理的地址電話）、`tools/make_pdf.py` 產出的 PDF。
`publish.py` 用白名單只複製這些到 `dist/`：

```
index.html  assets/style.css  assets/app.js  assets/blur.css
data/data.js  images/full/  images/thumb/  robots.txt  CNAME
```

`robots.txt` 擋搜尋引擎，`index.html` 也有 `<meta name="robots" content="noindex">`。

> **這是公開網址，沒有密碼保護。** surge 免費方案不提供存取控制，
> 網址本身就是唯一的門檻——只有拿到網址的人找得到，但拿到的人都看得到全部內容。
> 網址用隨機字串、不帶任何語意，也不要進版控（`.surge-domain` 已在 `.gitignore`）。
> 搬完家之後記得 `npx surge teardown <網域>` 收掉。

## 需求

Python 3 + PyYAML + Pillow（本機皆已安裝），不需 npm 套件、不需 ImageMagick。
產生 PDF 需要 Chrome，發佈需要 `npx surge`。
