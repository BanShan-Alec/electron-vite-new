# 项目概览 - Electron BLE Scanner

## 📋 项目简介

这是一个基于 **Electron + React + TypeScript** 的桌面 BLE（低功耗蓝牙）扫描应用，专注于 SP51A 设备的连接与电量读取功能。

## 🛠 技术栈

| 分类 | 技术 | 版本 |
|------|------|------|
| 框架 | Electron | ^39.2.6 |
| 前端 | React | ^19.2.1 |
| 语言 | TypeScript | ^5.9.3 |
| 构建 | electron-vite | ^5.0.0 |
| 打包 | electron-builder | ^26.0.12 |
| BLE 库 | @stoprocent/noble | ^2.3.10 |

## 📁 项目结构

```
electron-vite-new/
├── src/
│   ├── main/                    # Electron 主进程
│   │   ├── index.ts             # 主进程入口
│   │   ├── ble.ts               # BLE 服务层
│   │   └── fsm/                 # 有限状态机模块
│   │       ├── AsyncStateMachine.ts   # 异步状态机基类
│   │       ├── BleDeviceFSM.ts        # BLE 设备状态机
│   │       ├── Sp51aDeviceFSM.ts      # SP51A 设备状态机
│   │       └── index.ts               # 模块导出
│   ├── preload/                 # 预加载脚本
│   │   └── index.ts             # IPC 桥接层
│   ├── renderer/                # 渲染进程（React 应用）
│   │   └── src/
│   │       ├── App.tsx          # 主应用组件
│   │       └── assets/          # 样式文件
│   └── share/                   # 共享代码
│       └── interface.ts         # 类型定义
├── build/                       # 构建资源
├── out/                         # 编译输出
├── electron.vite.config.ts      # Vite 配置
├── electron-builder.yml         # 打包配置
└── package.json                 # 项目配置
```

## 🚀 快速开始

```bash
# 安装依赖
yarn install

# 开发模式
yarn dev

# 构建
yarn build

# 打包
yarn build:win   # Windows
yarn build:mac   # macOS
yarn build:linux # Linux
```

## 🎯 核心功能

1. **BLE 设备扫描** - 发现附近的低功耗蓝牙设备
2. **设备连接** - 连接到目标设备（重点支持 SP51A）
3. **电量读取** - 读取设备电池电量（Battery Service 0x180F）
4. **状态管理** - 基于 FSM 的设备连接状态管理

## 📊 架构图

```mermaid
graph TB
    subgraph Renderer["渲染进程 (React)"]
        App[App.tsx]
    end

    subgraph Preload["预加载脚本"]
        IPC[IPC Bridge]
    end

    subgraph Main["主进程 (Electron)"]
        Index[index.ts]
        BLE[BleService]
        FSM[FSM Module]
    end

    subgraph FSM_Detail["状态机模块"]
        ASM[AsyncStateMachine]
        BFSM[BleDeviceFSM]
        SFSM[Sp51aDeviceFSM]
    end

    subgraph External["外部"]
        Noble[@stoprocent/noble]
        Device[BLE 设备]
    end

    App <-->|ble API| IPC
    IPC <-->|ipcRenderer| Index
    Index --> BLE
    BLE --> FSM
    FSM --> ASM
    ASM --> BFSM
    BFSM --> SFSM
    BLE --> Noble
    Noble <-->|BLE| Device
```

## 📚 详细文档

### 模块分析
- [FSM 状态机模块](../模块分析/FSM状态机模块.md) - 异步状态机实现
- [BLE 服务模块](../模块分析/BLE服务模块.md) - 蓝牙服务层
- [渲染层模块](../模块分析/渲染层模块.md) - React UI 实现

### 业务流程
- [设备扫描与连接流程](../业务流程/设备扫描与连接流程.md) - 完整的 BLE 交互流程
- [SP51A 电量读取流程](../业务流程/SP51A电量读取流程.md) - 专用设备处理

## 📝 设计亮点

1. **FSM 架构** - 使用有限状态机管理复杂的 BLE 连接状态
2. **事件队列** - 解决异步状态转换中的死锁问题
3. **继承扩展** - 通过子类 Hook 实现设备特定行为
4. **类型安全** - 完整的 TypeScript 类型定义

## 🔗 相关链接

- [Electron](https://www.electronjs.org/)
- [electron-vite](https://electron-vite.org/)
- [Noble BLE](https://github.com/stoprocent/noble)

