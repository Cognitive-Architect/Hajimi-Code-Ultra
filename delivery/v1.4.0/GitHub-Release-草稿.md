# Hajimi Code v1.4.0 "Ouroboros Final" - 五集群会师

> 🐍♾️ 五集群会师完成，三层TLS防护 + 九债清零

---

## 🎯 版本亮点

### 五集群功能摘要

| 集群 | 核心功能 | 关键成果 |
|------|----------|----------|
| **OR-IPDIRECT** | OpenRouter IP直连 | 绕过DNS封锁，104.21.63.51直连 |
| **ALICE-ML** | 本地ML推理 | ONNX 25ms推理 + 云端Fallback |
| **ALICE-UI** | Blue Sechi悬浮球 | 48px Q版画风 + 七权人格化菜单 |
| **DEBT-CLEARANCE** | 技术债务清零 | 9项债务全部清偿 |
| **TLS-PINNING** | 三层防护体系 | 证书固定+拜占庭共识+DoH |

---

## 🔒 三层TLS防护说明

```
Layer 3: DoH预解析
├── 绕过系统DNS污染
├── Cloudflare DoH JSON API  
└── 硬编码IP交叉验证

Layer 2: 拜占庭共识
├── 3IP并发查询 (104.21.63.51/52/53)
├── 2/3多数决 (响应哈希比对)
└── 异常IP 30分钟黑名单

Layer 1: 证书固定
├── SPKI SHA256指纹
├── 主/备双指纹
└── <100ms熔断机制
```

---

## 📦 安装命令

```bash
# 克隆仓库
git clone https://github.com/Cognitive-Architect/Hajimi-Code-Ultra.git
cd Hajimi-Code-Ultra

# 切换到v1.4.0-final
git checkout v1.4.0-final

# 安装依赖
npm install

# 运行验证
npm run test:or:logs
npm run storybook:alice
```

---

## 📁 六件套下载

- [白皮书合集 (ZIP)](./six-pack/whitepapers.zip)
- [自测表合集 (ZIP)](./six-pack/self-tests.zip)
- [债务清偿报告 (PDF)](./six-pack/debt-clearance.pdf)
- [迁移指南 (MD)](./six-pack/migration-guide.md)

---

## ⚠️ 残余风险声明

| 风险 | 等级 | 说明 |
|------|------|------|
| 国家级全流量镜像 | 极高 | 攻击者控制所有路径时防护失效 |
| Cloudflare证书轮换 | P1 | 季度需更新指纹 |
| DoH端点被墙 | P2 | 需备用DoH |

---

## 🏷️ 标签验证

```bash
git show v1.4.0-final
# 验证提交: 65ce765
# 验证文件: 72 files, 13772 insertions
```

---

**Release Date**: 2026-02-17  
**Commit**: 65ce765  
**Tag**: v1.4.0-final

🐍♾️ **五集群会师完成！**
