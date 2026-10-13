# 贡献指南

感谢你愿意为 Pixora 出一份力。本文档说明如何参与开发。

## 设计原则

在动手之前，请先理解项目的三条底线：

1. **零依赖**。不要引入框架、运行时库或 CSS 框架。所有代码必须是手写的原生 HTML / CSS / JavaScript。
2. **隐私不可妥协**。任何功能都不得把用户图片发送到服务器。所有处理必须留在浏览器内。
3. **不臃肿**。Pixora 是「把高频操作做到极致」的工具，不是全能编辑器。新功能必须证明它值得占用首屏体积。

如果某个改动会破坏以上任一条，请先开 Issue 讨论。

## 开发流程

```bash
# 1. Fork 并克隆
git clone https://github.com/<your-name>/pixora.git
cd pixora

# 2. 起一个静态服务器（无构建步骤）
python -m http.server 8080
# 打开 http://localhost:8080

# 3. 新建分支
git checkout -b feat/your-feature
```

## 代码规范

### 通用

- 缩进 2 空格，使用 ASCII 直引号
- 文件结尾保留一个换行
- 不提交压缩/混淆后的代码（站点本身就是源码）

### HTML

- 语义化标签优先（`header` / `nav` / `main` / `section` / `article` / `footer`）
- 每页仅一个 `<h1>`，标题层级不跳级
- 所有 `<img>` 必须有 `alt`；装饰性图片用 `alt=""`
- 交互元素必须可用键盘操作，并有可见焦点样式

### CSS

- 颜色、间距、圆角一律走 `:root` 中的 Design Token，不写魔法值
- 深色模式通过 `html[data-theme="dark"]` 覆盖 Token，而不是散落的 `@media` 分支
- 新组件放在 `assets/css/style.css` 对应分区下，保持分区编号连续

### JavaScript

- 原生 ES2017+，不引入任何依赖
- 使用 IIFE 包裹，避免污染全局
- DOM 查询用 `querySelector` / `querySelectorAll`，缓存重复查询
- 异步统一用 `async/await`，错误必须被 `try/catch` 捕获并给出用户可读提示
- 新增的可交互控件需同步更新 `aria-*` 属性

## 无障碍（Accessibility）

提交前请自查：

- [ ] 全站可用 `Tab` 键走通，焦点可见
- [ ] 所有图片有合适的 `alt`
- [ ] 颜色对比度达到 WCAG AA（正文 ≥ 4.5:1）
- [ ] 尊重 `prefers-reduced-motion`
- [ ] 表单控件有关联的 `<label>`

## SEO 检查清单

改动页面结构时，请确认以下项没有被破坏：

- [ ] `<title>` 唯一且长度合理（中文 ≤ 30 字为宜）
- [ ] `<meta name="description">` 存在且与页面内容一致
- [ ] `<link rel="canonical">` 指向正式地址
- [ ] JSON-LD `@graph` 与页面可见内容一致（**不要标注页面上不存在的 FAQ**）
- [ ] 新增图片资源同步更新 `sitemap.xml` 的 `image:image`
- [ ] OG 图仍为 1200×630

> 结构化数据必须与可见内容一致。为了让富结果好看而编造评分、价格或问答，属于违规行为，会被直接拒绝。

## 提交信息

使用 [Conventional Commits](https://www.conventionalcommits.org/)：

```
feat: 新增按高度等比缩放
fix: 修复暗色模式下开关轨道对比度不足
perf: 降低大图缩放的中间画布内存占用
docs: 补充部署说明
a11y: 为拖放区补充键盘操作
seo: 为 FAQ 补充 HowTo 结构化数据
```

## 提交 Pull Request

1. 确保改动聚焦单一主题
2. 在 PR 描述里说明：**做了什么 / 为什么 / 如何验证**
3. 附上前后对比截图（涉及 UI 时）
4. 若改动影响 SEO 或性能，请说明验证方式

## 安全

如果发现安全问题（例如 XSS、隐私泄露、可被利用的解析漏洞），请**不要**公开开 Issue，而是通过
[security.txt](.well-known/security.txt) 中的渠道私下联系维护者。

## 许可证

你的贡献将以 [MIT](LICENSE) 许可证发布。
