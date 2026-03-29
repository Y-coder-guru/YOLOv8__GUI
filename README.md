# YOLOv8 Flask 监控管理系统（前端展示 + 模型接口预留）

## 1. 功能概览
- 用户注册 / 登录 / 持久化记忆（SQLite）
- 登录保护：未登录不可访问监控系统
- 5 大页面：登录、实时监控、数据统计、历史记录、管理员
- 摄像头调用（浏览器 `getUserMedia`）
- YOLO 检测接口预留（当前返回模拟数据）
- 实时动态折线图、饼图、柱状图 + 今日统计卡片
- 历史记录按时间倒序、关键词筛选、时间区间筛选、分页
- 管理员查看用户、系统状态、日志、删除历史记录

## 2. 项目结构
```bash
YOLOv8__GUI/
├── app.py
├── requirements.txt
├── README.md
├── instance/
│   └── yolo_monitor.db            # 自动创建
├── models/
│   └── best.pt                    # 你训练好的模型放这里（手动创建）
├── static/
│   ├── css/style.css
│   └── js/
│       ├── monitor.js
│       ├── stats.js
│       ├── history.js
│       └── admin.js
└── templates/
    ├── base.html
    ├── login.html
    ├── register.html
    ├── monitor.html
    ├── stats.html
    ├── history.html
    └── admin.html
```

## 3. 安装与启动
```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

启动后控制台会显示：
- `http://127.0.0.1:5000`
- `http://0.0.0.0:5000`
- `http://你的局域网IP:5000`（同一 WiFi 手机/平板可访问）

## 4. 默认管理员账号
- 用户名：`admin`
- 密码：`admin123456`

## 5. 模型替换接口（最关键）
你只需要改一个地方：`app.py` 里的 `YoloModelService.predict_from_frame()`。

### 建议步骤
1. 把训练好的模型放到：`models/best.pt`
2. 在 `predict_from_frame()` 里加载你自己的 YOLO 模型
3. 输出格式保持不变：
```python
{
  "boxes": [
    {"x": 120, "y": 90, "w": 160, "h": 180, "label": "person", "conf": 0.87}
  ],
  "counts": {"person": 2, "car": 1}
}
```
4. 前端会自动显示框、类别、置信度、实时数量，并写入数据库

## 6. 数据记忆说明
SQLite 文件：`instance/yolo_monitor.db`
永久存储：
- 用户账号密码（哈希）
- 检测时间、类别、数量、置信度
- 历史记录
- 系统日志

重启电脑后数据仍保留。

## 7. 主要 API（用于前后端对接）
- `POST /api/camera/start` 开启摄像头状态
- `POST /api/camera/stop` 关闭摄像头状态
- `POST /api/detection/start` 开始检测状态
- `POST /api/detection/stop` 停止检测状态
- `GET /api/detection/frame-data` 获取本帧检测结果（占位接口）
- `GET /api/stats/live` 获取动态图表数据
- `GET /api/history` 获取历史记录（支持筛选+分页）
- `GET /api/admin/overview` 获取管理员总览
- `DELETE /api/admin/history/<id>` 删除单条历史

## 8. 作业第一版：进制与编码实验台
新增页面：`/number-lab`（首页 `/` 已跳转到此页面）。

### 已实现
- 输入两个整数，支持分别以 `2/8/10/16` 进制输入。
- 输出支持 `2/8/10/16` 进制。
- 展示每个输入数在固定字长（8/16/32 位）下的：
  - 真值
  - 原码
  - 反码
  - 补码
  - 移码
- 提供 `A+B`、`A-B`、`A×B` 结果。
- 右侧统计区包含：
  - 动态柱状图（A、B、A+B、A-B、A×B）
  - 本地历史记录（LocalStorage）

### 接口
- `POST /api/number-lab/convert`
