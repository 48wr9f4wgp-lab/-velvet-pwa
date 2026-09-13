# Workshop Sandbox — 3D Simulator Core

スマホ優先の軽量3Dシミュレーター共通基盤。現時点は **Vertical Slice / Functional Build** であり、商品完成ではない。

## Core Loop

箱を運ぶ → 棚へ置く / 売却する → 資金を得る → 箱を補充する → より効率よく回す。

## Technical goals

- iPhone Safariを最優先
- 静的配信でサーバー常時稼働なし
- Three.jsで描画
- Rapier WASMで箱の重力・衝突・積載
- 端末側の負荷を抑えるため低ポリゴン・影なし・DPR制限
- localStorageでローカル保存
- GitHub Pagesの `main/docs` 配信を前提に、ビルド工程とGitHub Actionsを使わない

## Current slice

- 一人称移動 / 視点操作
- 箱をつかむ・運ぶ・落とす
- 物理衝突
- 棚
- 売却ゾーン
- 資金
- 箱購入
- 進行保存
- iPhone用タッチ操作
- PC用WASD / マウス操作

## Performance budget (initial)

- 動的剛体: 30個以内を初期目安
- devicePixelRatio: 最大1.5
- realtime shadow: OFF
- post process: OFF
- texture: 原則なし
- physics timestep: 60Hz
- stopped bodies: Rapier sleepingを利用

## Free-tier deployment policy

ビルド用サーバーや常時APIを使わず、`docs/` をそのまま静的配信する。GitHub Actionsは初期段階では使わない。

GitHub Pagesの初回のみ、Repository Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/docs` → Save を設定する。以後は `docs/` への更新をそのまま実機確認する。

## Release rule

起動・操作・進行不能を最優先で修正し、変更後は build相当確認 → behavior verify → regression の順で確認する。公開商品化前には最新ベンチマーク、UI/Art/Game Feel、Audio/Haptics、Analytics、Save safety、Performance、QAを別途通す。
