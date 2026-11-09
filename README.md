# dsh-bookmarks · 会话书签

给 DSH 的对话加「书签」：划选一段话或整条消息标记下来，之后一键跳回去。

## 怎么用

- **标记一段话**：在任意一条消息里划选文字，输入框上方会出现一个「标记选中的文字」按钮，点它即可。按钮固定在输入框正上方，不会被系统自带的「复制 / 剪切 / 全选」菜单压住。
- **标记整条消息**：点输入框工具条上的书签图标打开面板 → 底部「标记消息」→ 再点会话里的任意一条消息。
- **定位**：打开书签面板，点任意一条书签；面板有「本会话 / 全部」两个页签，点「全部」里的条目会先打开对应会话再定位。
- 跳转时会先加载那段历史（如果还没加载），滚动到目标位置：
  - 文字书签：把标记的那段文字用黄色底高亮约 4 秒；
  - 整条消息书签：给那条消息闪一圈边框。
- 面板里每条书签右侧的 `×` 是删除。

## 数据放在哪

浏览器 `localStorage` 的 `dshm.bookmarks.v1`，按会话 id 归档，只存在本机这个 profile 里，不经过宿主、不上传。

## 已知边界

- 书签锚在消息的渲染键（`data-chat-flow-key`）上，同时记录轮次（`data-chat-turn`）和该轮的 `turnOutline` seq。消息还在时能精确落点；如果整轮历史被压缩/清掉，会退化成“定位到该轮”，再找不到就提示。
- 跳转用 `loadThrough(seq)` 定向补历史，最多重试 6 次（约 20 秒）；第一补会提示「正在加载那段历史…」。
- 文字高亮用覆盖层画在文字上方（不依赖 CSS Custom Highlight API），所以 WebView 不支持该 API 时也能正常高亮；匹配不到原文时退回整条消息闪框。
- 划选标记只对普通消息文本生效（代码块等没有 `data-text-interaction-source` 的区域不出按钮）；这时可以用「标记消息」。

## 回滚

1. 删掉 profile `package.json` 里 `dependencies.dsh-bookmarks` 与 `dsh.profile.bundles` 中的 `dsh-bookmarks`；
2. 删掉 `profiles/ondevice/plugins/dsh-bookmarks/` 与 `profiles/ondevice/node_modules/dsh-bookmarks/`；
3. 重启应用。

改动前的 `package.json` 备份：`profiles/ondevice/package.json.bak-before-dsh-bookmarks`。
