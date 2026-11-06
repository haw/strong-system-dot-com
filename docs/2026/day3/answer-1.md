# Day 3 障害1の答え：設定を読めない

[Day 3 のハンズオン](./)の 4-1 の答えです。

## 原因

EC2 のロール `day3-2026-ec2-role-{あなたの名前}` のインラインポリシー `day3-2026-read-my-params` で、`Deny` の `NotResource` に書かれたパスが、`/day3-2026/{あなたの名前}/db` ではなく `/day3-2026/{あなたの名前}/database` になっています。

`Deny` は「`NotResource` に書いたもの**以外**を拒否する」という意味です。パスが違うので、自分のパラメータ `/db/...` まで拒否の対象になりました。明示的な拒否は許可より優先されるので（Day 1）、`Allow` があっても読めません。

## 根拠

- 画面とログのエラーが `AccessDeniedException` で、`with an explicit deny` と書かれている。
- EC2 で `aws ssm get-parameters` を実行しても、同じ `AccessDeniedException` になる。
- インラインポリシーの JSON で、`Allow` の `Resource` は `/db/*` なのに、`Deny` の `NotResource` は `/database` になっている。

## 直し方

1. **IAM** の「ロール」で `day3-2026-ec2-role-{あなたの名前}` を開き、「許可」タブでインラインポリシー `day3-2026-read-my-params` を選ぶ。
2. 「編集」を選び、「JSON」で `DenyOtherParams` の `NotResource` にある2つの `/database` を、`/db` に直す。`/database/*` は `/db/*` になる。
3. 「次へ」→「変更を保存」を選ぶ。
4. EC2 で `aws ssm get-parameters` を実行し、値が表示されることを確かめる。反映に数秒かかることがあります。
5. 4-0 のコマンドで、アプリケーションを起動し直す。

`Deny` を消したり、`AdministratorAccess` を付けたりしてはいけません。読めるようにはなりますが、ほかの受講者のパラメータ（パスワードを含む）まで読めるようになります。

## 現場では、こうして起きる

権限を必要最小限に絞る見直しで、ポリシーのパスを書き間違えた。見直しのつもりの変更で、アプリケーション自身の権限まで奪ってしまう例です。

## 直ったときの見え方

`AccessDeniedException` は消えます。代わりに `ENOTFOUND` が出ます。障害2（4-2）に進みます。
