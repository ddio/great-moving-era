# 搬家估價說明網頁

給搬家公司線上估價用的單頁說明：搬運條件、全屋彙總、各房間文字說明與照片。
純靜態、無框架，手機／桌機／紙本列印皆可用。

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
| 物品 | `[名稱, 數量, 尺寸, 備註]`；尺寸寫 `長×寬×高cm` 會自動算材積 |
| 標準容器 | 尺寸填「標準箱」(60×40×40)、「標準吊衣箱」(50×50×100) 也會計入材積 |
| 紙箱歸類 | 品項名稱含「箱」字者，統計時與家具家電分開 |

圖說中若要用半形冒號，請用引號包起來：`- "抽屜: 線材"`。

## 頁面功能

- **縮圖／原圖切換**：預設縮圖（長邊 1000px）加快開啟；選擇會記在瀏覽器
- **點圖放大**：一律載入原圖，可用 ← → 切換、Esc 關閉
- **細節照片**：桌機預設展開、手機預設收合，可一鍵全展開／全收合
- **列印／存 PDF**：按鈕會先切換成原圖、等圖片載入完成才叫出列印，避免印出空白圖；
  每個房間自動分頁，照片兩欄排列
- **全屋彙總**：件數、紙箱數、材積由各房間物品清單自動加總

## 圖片處理

原始檔放 `images/src/`，其餘兩個目錄由 `tools/images.py` 產生，不要手動改：

| 目錄 | 內容 | 用途 |
| --- | --- | --- |
| `images/src/` | 你給的原始檔（不進 git） | 母檔，只留在你機器上 |
| `images/full/` | 長邊 3000px、JPEG q75 | 點圖放大、列印 |
| `images/thumb/` | 長邊 1000px、JPEG q78 | 網頁預設顯示 |

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

## 部署

```bash
npx surge . your-project-name.surge.sh
```

整包（含 `images/full/`）直接上傳即可，沒有後端。
若照片很多，建議先確認 `images/full/` 總大小；縮圖已壓到約原圖的 30%。

## 需求

Python 3 + PyYAML + Pillow（本機皆已安裝），不需 npm 套件、不需 ImageMagick。
