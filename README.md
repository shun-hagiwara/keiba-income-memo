# 競馬収支メモ

SPAT4スマホ版の「投票内容照会」スクリーンショットから収支を記録するMVPです。

## 対象

- 初期対象はSPAT4のスマホ画像
- IPAT/JRA、PC画像、ブラウザ拡張、自動ログインは後続対応
- 入力はユーザーが選択した画像のみ。複数画像の一括OCRと、1画像内の複数投票候補にも対応します。
- 読み取り候補には画像サムネイルを表示し、候補と元画像を照合できます。

## 利用者向けの案内

人に配布する場合は、以下の資料を案内してください。

- [初めて使う方向けの使い方](docs/share-guide.md)

## セキュリティ方針

- SPAT4/JRAのID、パスワード、暗証番号は扱いません。
- 投票サイトへの自動ログイン、自動投票、定期巡回、内部APIアクセスは行いません。
- 画像はサーバーへ送信せず、ブラウザ内でOCRします。
- 保存データはブラウザのlocalStorageに保存します。
- 追加機能として、Google Identity ServicesとGoogle Drive APIを使ったオプション同期にも対応します。Googleログイン後に `KeibaMemo` フォルダ内の `records.json` を保存・読込できます。
- Drive同期はクライアント側のみで動作し、Client Secretは使用しません。
- Google Driveのアクセストークンは永続保存しません。ページを開き直した場合は必要に応じて再ログインします。
- OCRライブラリはCDNから取得します。投票画像自体はCDNへ送信しません。

## 使い方

```powershell
node server.mjs
```

ブラウザで `http://127.0.0.1:4173` を開きます。

## ローカル確認とテスト

`file://.../index.html` で直接開くと、OCR worker / wasm / Google OAuth / PWA系のブラウザ制約で失敗しやすいため、ローカル確認もHTTP配信で行います。

```powershell
$env:PORT=4174
node server.mjs
```

ブラウザでは `http://127.0.0.1:4174/` を開きます。開発時の最低限の自動確認は以下です。

```powershell
npm test
git diff --check
```

`tests/parser.test.mjs` はSPAT4/IPATのOCRテキストパーサ確認用です。IPAT画像で `0円` が `Om`、`購入200円` が `購入200m`、`確` が別文字に崩れるケースを含めています。

実画面で画像アップロードからOCR候補表示まで確認する場合は、別ターミナルで `node server.mjs` を起動したまま以下を実行します。

```powershell
$env:TEST_APP_URL="http://127.0.0.1:4174/"
npm run test:e2e -- "C:\Users\shagi\Downloads\S__274374658.jpg"
```

このE2E確認はChrome/Edgeをヘッドレス起動し、実際に画像inputへファイルを入れて `OCRする` を押します。成功条件は、IPAT画像から `京都 12R`、`京都 11R`、`東京 12R`、`東京 11R` の4候補が出ることです。

## デプロイ

静的ファイルだけで動くため、以下のファイルを静的ホスティングに配置できます。

- `index.html`
- `styles.css`
- `app.js`
- `manifest.webmanifest`
- `assets/horse-hero.png`

本番ではHTTPS配信を前提にしてください.
