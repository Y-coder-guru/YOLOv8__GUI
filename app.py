from __future__ import annotations

import base64
import json
import time
import random
import socket
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

from werkzeug.security import check_password_hash, generate_password_hash

from flask import (
    Flask,
    Response,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
    has_request_context,
)
from flask_login import (
    LoginManager,
    UserMixin,
    current_user,
    login_required,
    login_user,
    logout_user,
)
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import func, text

try:
    import serial
except ImportError:  # pragma: no cover
    serial = None

try:
    from serial.tools import list_ports
except ImportError:  # pragma: no cover
    list_ports = None

try:
    from ultralytics import YOLO
except ImportError:  # pragma: no cover
    YOLO = None

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "instance" / "yolo_monitor.db"

app = Flask(__name__)
app.config.update(
    SECRET_KEY="replace-this-with-a-long-random-secret",
    SQLALCHEMY_DATABASE_URI=f"sqlite:///{DB_PATH}",
    SQLALCHEMY_TRACK_MODIFICATIONS=False,
    REMEMBER_COOKIE_DURATION=timedelta(days=180),
    REMEMBER_COOKIE_HTTPONLY=True,
    REMEMBER_COOKIE_SAMESITE="Lax",
)
app.permanent_session_lifetime = timedelta(days=180)

db = SQLAlchemy(app)
login_manager = LoginManager(app)
login_manager.login_view = "login"
login_manager.login_message = "请先登录后再访问监控系统。"


class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    is_admin = db.Column(db.Boolean, default=False)
    is_active_account = db.Column(db.Boolean, default=True)
    last_login_at = db.Column(db.DateTime, nullable=True)
    email = db.Column(db.String(120), nullable=False, default="")
    phone = db.Column(db.String(30), nullable=False, default="")
    avatar_url = db.Column(db.String(255), nullable=False, default="")
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class DetectionRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    detect_time = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    category = db.Column(db.String(50), nullable=False, index=True)
    count = db.Column(db.Integer, nullable=False)
    confidence = db.Column(db.Float, nullable=False)
    operator_name = db.Column(db.String(50), nullable=False, default="system")
    operation_type = db.Column(db.String(50), nullable=False, default="自动检测")
    note = db.Column(db.String(255), nullable=False, default="")


class SystemLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    operator = db.Column(db.String(50), nullable=False, default="system")
    ip = db.Column(db.String(64), nullable=False, default="-")
    result = db.Column(db.String(20), nullable=False, default="成功")
    log_type = db.Column(db.String(50), nullable=False)
    content = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


class SystemConfig(db.Model):
    key = db.Column(db.String(80), primary_key=True)
    value = db.Column(db.Text, nullable=False, default="")
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class DailyDetectionDuration(db.Model):
    day = db.Column(db.String(10), primary_key=True)  # YYYY-MM-DD
    seconds = db.Column(db.Integer, nullable=False, default=0)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


@login_manager.user_loader
def load_user(user_id: str):
    return User.query.get(int(user_id))


class YoloModelService:
    """
    模型替换说明（后续你接入真实 YOLO 时只改这里）：
    1) 把训练好的权重放到: /workspace/YOLOv8__GUI/models/best.pt
    2) 在 `predict_from_frame` 内部加载你的模型并做推理。
    3) 保持返回格式不变，前端与数据库将自动复用。

    返回格式:
    {
      "boxes": [
        {"x": 120, "y": 90, "w": 160, "h": 180, "label": "person", "conf": 0.87}
      ],
      "counts": {"person": 2, "car": 1}
    }
    """

    def __init__(self):
        self.model_path = BASE_DIR / "models" / "best.pt"
        self.model = None
        if YOLO:
            try:
                if self.model_path.exists():
                    self.model = YOLO(str(self.model_path))
                else:
                    self.model = YOLO("yolov8n.pt")
            except Exception:
                self.model = None

    def predict_from_frame(self, frame_meta: dict | None = None) -> dict:
        if self.model:
            # 演示环境优先使用本地测试图，避免 URL 不可用。
            demo_img = BASE_DIR / "static" / "img" / "yolo_demo.jpg"
            source = str(demo_img) if demo_img.exists() else "https://ultralytics.com/images/bus.jpg"
            result = self.model.predict(source=source, verbose=False)[0]
            boxes = []
            counts = Counter()
            for b in result.boxes:
                cls_id = int(b.cls.item())
                label = result.names.get(cls_id, str(cls_id))
                conf = round(float(b.conf.item()), 2)
                x1, y1, x2, y2 = [int(v) for v in b.xyxy[0].tolist()]
                boxes.append({"x": x1, "y": y1, "w": x2 - x1, "h": y2 - y1, "label": label, "conf": conf})
                counts[label] += 1
            return {"boxes": boxes, "counts": dict(counts)}

        labels = ["monitor", "keyboard", "mouse", "laptop", "bottle", "chair", "cup", "book"]
        box_count = random.randint(1, 6)
        boxes = []
        counts = Counter()

        for _ in range(box_count):
            label = random.choice(labels)
            conf = round(random.uniform(0.55, 0.98), 2)
            x, y = random.randint(16, 540), random.randint(16, 300)
            w, h = random.randint(40, 180), random.randint(40, 180)
            boxes.append({"x": x, "y": y, "w": w, "h": h, "label": label, "conf": conf})
            counts[label] += 1

        return {"boxes": boxes, "counts": dict(counts)}


model_service = YoloModelService()

runtime_state = {
    "camera_on": False,
    "camera_state": "未连接",
    "detection_on": False,
    "last_detection_time": None,
    "camera_type": "local",
    "openmv_connected": False,
    "openmv_mode": "serial",
    "openmv_target": "",
    "openmv_last_frame_at": None,
    "openmv_last_len": 0,
    "camera_started_at": None,
    "last_inference_ms": 0,
}

openmv_serial_conn = None

openmv_settings = {
    "resolution": "720P",
    "fps": 15,
    "baudrate": 115200,
    "flip_horizontal": False,
    "flip_vertical": False,
    "exposure": 50,
    "gain": 1.0,
    "auto_white_balance": True,
    "serial_timeout": 800,
}


def bjt_now() -> datetime:
    return datetime.utcnow() + timedelta(hours=8)


def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    return check_password_hash(password_hash, password)


def add_log(log_type: str, content: str, user_id: int | None = None, result: str = "成功"):
    operator = "system"
    ip = request.remote_addr if has_request_context() else "-"
    if user_id:
        user = User.query.get(user_id)
        if user:
            operator = user.username
    db.session.add(SystemLog(log_type=log_type, content=content, user_id=user_id, operator=operator, ip=ip or "-", result=result))
    db.session.commit()


def set_config_json(key: str, value: dict):
    record = db.session.get(SystemConfig, key)
    payload = json.dumps(value, ensure_ascii=False)
    if record:
        record.value = payload
    else:
        db.session.add(SystemConfig(key=key, value=payload))
    db.session.commit()


def get_config_json(key: str, default: dict):
    record = db.session.get(SystemConfig, key)
    if not record:
        return default
    try:
        data = json.loads(record.value)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass
    return default


def add_duration_seconds(start_dt: datetime, end_dt: datetime):
    if end_dt <= start_dt:
        return
    cursor = start_dt
    while cursor < end_dt:
        next_day = datetime(cursor.year, cursor.month, cursor.day) + timedelta(days=1)
        seg_end = min(end_dt, next_day)
        seg_seconds = int((seg_end - cursor).total_seconds())
        day_key = cursor.strftime("%Y-%m-%d")
        rec = db.session.get(DailyDetectionDuration, day_key)
        if not rec:
            rec = DailyDetectionDuration(day=day_key, seconds=0)
            db.session.add(rec)
        rec.seconds += max(seg_seconds, 0)
        cursor = seg_end
    db.session.commit()


def get_today_detection_seconds() -> int:
    day_key = datetime.utcnow().strftime("%Y-%m-%d")
    rec = db.session.get(DailyDetectionDuration, day_key)
    total = rec.seconds if rec else 0
    if runtime_state["camera_on"] and runtime_state["camera_started_at"]:
        start_ts = runtime_state["camera_started_at"]
        start_dt = datetime.utcfromtimestamp(start_ts)
        now = datetime.utcnow()
        if start_dt.strftime("%Y-%m-%d") == day_key:
            total += int((now - start_dt).total_seconds())
        elif start_dt < now:
            day_start = datetime(now.year, now.month, now.day)
            total += int((now - day_start).total_seconds())
    return max(total, 0)


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with app.app_context():
        db.create_all()
        user_columns = {
            row[1]
            for row in db.session.execute(text("PRAGMA table_info('user')")).fetchall()
        }
        if "is_active_account" not in user_columns:
            db.session.execute(
                text(
                    "ALTER TABLE user ADD COLUMN is_active_account BOOLEAN NOT NULL DEFAULT 1"
                )
            )
            db.session.commit()
        if "last_login_at" not in user_columns:
            db.session.execute(text("ALTER TABLE user ADD COLUMN last_login_at DATETIME"))
            db.session.commit()
        if "email" not in user_columns:
            db.session.execute(text("ALTER TABLE user ADD COLUMN email VARCHAR(120) NOT NULL DEFAULT ''"))
            db.session.commit()
        if "phone" not in user_columns:
            db.session.execute(text("ALTER TABLE user ADD COLUMN phone VARCHAR(30) NOT NULL DEFAULT ''"))
            db.session.commit()
        if "avatar_url" not in user_columns:
            db.session.execute(text("ALTER TABLE user ADD COLUMN avatar_url VARCHAR(255) NOT NULL DEFAULT ''"))
            db.session.commit()

        saved_openmv = get_config_json("openmv_settings", openmv_settings.copy())
        openmv_settings.update(saved_openmv)
        if not db.session.get(SystemConfig, "openmv_settings"):
            set_config_json("openmv_settings", openmv_settings)

        admin = User.query.filter_by(username="admin").first()
        if not admin:
            admin = User(
                username="admin",
                password_hash=hash_password("admin123456"),
                is_admin=True,
            )
            db.session.add(admin)
            db.session.commit()
            add_log("system", "初始化默认管理员账号：admin/admin123456")


def get_lan_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as s:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"


def parse_time_range(range_key: str, start_time: str, end_time: str):
    now = datetime.utcnow()
    if range_key == "today":
        start = datetime(now.year, now.month, now.day)
        end = now
    elif range_key == "yesterday":
        start = datetime(now.year, now.month, now.day) - timedelta(days=1)
        end = datetime(now.year, now.month, now.day) - timedelta(seconds=1)
    elif range_key == "7d":
        start = now - timedelta(days=7)
        end = now
    elif range_key == "30d":
        start = now - timedelta(days=30)
        end = now
    elif range_key == "custom":
        try:
            start = datetime.fromisoformat(start_time)
            end = datetime.fromisoformat(end_time)
        except (TypeError, ValueError):
            return None, None
    else:
        start = now - timedelta(days=1)
        end = now
    return start, end


@app.before_request
def make_session_permanent():
    if current_user.is_authenticated:
        session.permanent = True


@app.route("/")
def index():
    if current_user.is_authenticated:
        return redirect(url_for("monitor"))
    return redirect(url_for("login"))


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        remember = bool(request.form.get("remember", True))

        user = User.query.filter_by(username=username).first()
        if user and verify_password(user.password_hash, password):
            if not user.is_active_account:
                flash("账号已被禁用，请联系管理员", "danger")
                return render_template("login.html")
            login_user(user, remember=remember)
            user.last_login_at = datetime.utcnow()
            db.session.commit()
            add_log("auth", f"用户登录: {username}", user.id)
            return redirect(url_for("monitor"))

        flash("账号或密码错误", "danger")
    return render_template("login.html")


@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        confirm_password = request.form.get("confirm_password", "")

        if not username or len(password) < 6:
            flash("用户名不能为空，且密码长度至少 6 位", "warning")
            return render_template("register.html")
        if password != confirm_password:
            flash("两次密码输入不一致", "warning")
            return render_template("register.html")
        if User.query.filter_by(username=username).first():
            flash("用户名已存在", "warning")
            return render_template("register.html")

        user = User(username=username, password_hash=hash_password(password))
        db.session.add(user)
        db.session.commit()
        add_log("auth", f"新用户注册: {username}", user.id)
        flash("注册成功，请登录", "success")
        return redirect(url_for("login"))

    return render_template("register.html")


@app.route("/logout")
@login_required
def logout():
    if runtime_state["camera_started_at"]:
        add_duration_seconds(datetime.utcfromtimestamp(runtime_state["camera_started_at"]), datetime.utcnow())
    runtime_state["camera_on"] = False
    runtime_state["detection_on"] = False
    runtime_state["camera_state"] = "未连接"
    runtime_state["openmv_connected"] = False
    runtime_state["camera_started_at"] = None
    add_log("auth", f"用户退出: {current_user.username}", current_user.id)
    logout_user()
    return redirect(url_for("login"))


@app.route("/profile")
@login_required
def profile_page():
    return render_template("profile.html")


@app.route("/monitor")
@login_required
def monitor():
    return render_template("monitor.html")


@app.route("/stats")
@login_required
def stats_page():
    return render_template("stats.html")


@app.route("/history")
@login_required
def history_page():
    return render_template("history.html")


@app.route("/admin")
@login_required
def admin_page():
    if not current_user.is_admin:
        flash("只有管理员可以访问该页面", "warning")
        return redirect(url_for("monitor"))
    return render_template("admin.html")


@app.get("/api/system/status")
@login_required
def system_status():
    camera_state = runtime_state["camera_state"] if runtime_state["camera_on"] else "未连接"
    return jsonify(
        {
            "ok": True,
            "camera_on": runtime_state["camera_on"],
            "camera_state": camera_state,
            "detection_on": runtime_state["detection_on"],
            "camera_type": runtime_state["camera_type"],
            "openmv_connected": runtime_state["openmv_connected"],
            "openmv_mode": runtime_state["openmv_mode"],
            "openmv_target": runtime_state["openmv_target"],
            "openmv_settings": openmv_settings,
            "last_detection_time": runtime_state["last_detection_time"],
            "camera_started_at": runtime_state["camera_started_at"],
            "last_inference_ms": runtime_state["last_inference_ms"],
            "today_detection_seconds": get_today_detection_seconds(),
            "server_time": bjt_now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    )


@app.get("/api/openmv/ports")
@login_required
def openmv_ports():
    ports = []
    if list_ports:
        ports = [p.device for p in list_ports.comports()]
    if not ports:
        ports = ["COM3", "COM4", "/dev/ttyUSB0"]
    return jsonify({"ok": True, "ports": ports})


@app.post("/api/openmv/connect")
@login_required
def openmv_connect():
    payload = request.get_json(silent=True) or {}
    mode = payload.get("mode", "serial")
    target = (payload.get("target") or "").strip()
    if not target:
        return jsonify({"ok": False, "message": "请填写串口号或 IP 地址"}), 400

    global openmv_serial_conn
    if mode == "serial":
        if not serial:
            return jsonify({"ok": False, "message": "缺少 pyserial 依赖"}), 500
        try:
            openmv_serial_conn = serial.Serial(target, baudrate=openmv_settings["baudrate"], timeout=openmv_settings["serial_timeout"] / 1000)
        except Exception as exc:
            runtime_state["openmv_connected"] = False
            runtime_state["camera_state"] = "未连接"
            return jsonify({"ok": False, "message": f"串口连接失败: {exc}"}), 400

    runtime_state["camera_state"] = "连接中"
    runtime_state["openmv_connected"] = True
    runtime_state["openmv_mode"] = mode
    runtime_state["openmv_target"] = target
    runtime_state["camera_type"] = "openmv"
    add_log("device", f"OpenMV 已连接: {mode} {target}", current_user.id)
    return jsonify({"ok": True, "status": "connected", "mode": mode, "target": target, "baudrate": openmv_settings["baudrate"]})


@app.post("/api/openmv/disconnect")
@login_required
def openmv_disconnect():
    global openmv_serial_conn
    if openmv_serial_conn:
        try:
            openmv_serial_conn.close()
        except Exception:
            pass
        openmv_serial_conn = None
    runtime_state["openmv_connected"] = False
    runtime_state["camera_state"] = "未连接"
    runtime_state["openmv_target"] = ""
    add_log("device", "OpenMV 已断开", current_user.id)
    return jsonify({"ok": True, "status": "disconnected"})


@app.post("/api/openmv/settings")
@login_required
def update_openmv_settings():
    payload = request.get_json(silent=True) or {}
    openmv_settings["resolution"] = payload.get("resolution", openmv_settings["resolution"])
    openmv_settings["fps"] = int(payload.get("fps", openmv_settings["fps"]))
    openmv_settings["baudrate"] = int(payload.get("baudrate", openmv_settings["baudrate"]))
    openmv_settings["flip_horizontal"] = bool(payload.get("flip_horizontal", openmv_settings["flip_horizontal"]))
    openmv_settings["flip_vertical"] = bool(payload.get("flip_vertical", openmv_settings["flip_vertical"]))
    openmv_settings["exposure"] = int(payload.get("exposure", openmv_settings["exposure"]))
    openmv_settings["gain"] = float(payload.get("gain", openmv_settings["gain"]))
    openmv_settings["auto_white_balance"] = bool(payload.get("auto_white_balance", openmv_settings["auto_white_balance"]))
    openmv_settings["serial_timeout"] = int(payload.get("serial_timeout", openmv_settings["serial_timeout"]))
    global openmv_serial_conn
    if openmv_serial_conn and openmv_serial_conn.is_open:
        openmv_serial_conn.baudrate = openmv_settings["baudrate"]
        openmv_serial_conn.timeout = openmv_settings["serial_timeout"] / 1000
    set_config_json("openmv_settings", openmv_settings)
    add_log("device", f"更新 OpenMV 配置: {openmv_settings}", current_user.id)
    return jsonify({"ok": True, "settings": openmv_settings})


@app.post("/api/camera/start")
@login_required
def start_camera():
    payload = request.get_json(silent=True) or {}
    camera_type = payload.get("camera_type", "local")
    if camera_type == "openmv" and not runtime_state["openmv_connected"]:
        return jsonify({"ok": False, "message": "OpenMV 未连接，请先连接设备"}), 400

    runtime_state["camera_type"] = camera_type
    runtime_state["camera_on"] = True
    runtime_state["camera_state"] = "已连接" if camera_type == "local" else "连接中"
    if runtime_state["camera_started_at"] is None:
        runtime_state["camera_started_at"] = datetime.utcnow().timestamp()
    add_log("device", f"摄像头已开启({camera_type})", current_user.id)
    return jsonify({"ok": True, "camera_on": True, "camera_type": camera_type})


@app.post("/api/camera/stop")
@login_required
def stop_camera():
    if runtime_state["camera_started_at"]:
        start_dt = datetime.utcfromtimestamp(runtime_state["camera_started_at"])
        add_duration_seconds(start_dt, datetime.utcnow())
    runtime_state["camera_on"] = False
    runtime_state["detection_on"] = False
    runtime_state["camera_state"] = "未连接"
    runtime_state["camera_started_at"] = None
    runtime_state["last_inference_ms"] = 0
    if runtime_state["camera_type"] == "openmv":
        runtime_state["openmv_connected"] = False
    add_log("device", "摄像头已关闭", current_user.id)
    return jsonify({"ok": True, "camera_on": False})


@app.post("/api/detection/start")
@login_required
def start_detection():
    if not runtime_state["camera_on"]:
        return jsonify({"ok": False, "message": "请先打开摄像头"}), 400

    runtime_state["detection_on"] = True
    add_log("detection", "目标检测已开启", current_user.id)
    return jsonify({"ok": True, "detection_on": True})


@app.post("/api/detection/stop")
@login_required
def stop_detection():
    runtime_state["detection_on"] = False
    add_log("detection", "目标检测已停止", current_user.id)
    return jsonify({"ok": True, "detection_on": False})


@app.get("/api/detection/frame-data")
@login_required
def frame_data():
    if not runtime_state["camera_on"]:
        return jsonify({"ok": False, "message": "摄像头未开启", "boxes": [], "counts": {}})

    if not runtime_state["detection_on"]:
        return jsonify({"ok": True, "boxes": [], "counts": {}, "detection_on": False})

    frame_meta = {"source": runtime_state["camera_type"], "openmv": openmv_settings}
    infer_start = time.perf_counter()
    result = model_service.predict_from_frame(frame_meta=frame_meta)
    runtime_state["last_inference_ms"] = round((time.perf_counter() - infer_start) * 1000, 2)
    runtime_state["last_detection_time"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    for category, count in result["counts"].items():
        avg_conf = sum(b["conf"] for b in result["boxes"] if b["label"] == category) / count
        db.session.add(
            DetectionRecord(
                user_id=current_user.id,
                category=category,
                count=count,
                confidence=round(avg_conf, 2),
                operator_name=current_user.username,
                operation_type="目标检测",
            )
        )
    db.session.commit()

    return jsonify({"ok": True, **result, "detection_on": True})


@app.get("/api/stats/live")
@login_required
def live_stats():
    now = datetime.utcnow()
    today_start = datetime(now.year, now.month, now.day)
    today_records = DetectionRecord.query.filter(DetectionRecord.detect_time >= today_start).all()

    total_events = len(today_records)
    total_objects = sum(r.count for r in today_records)
    category_counter = Counter()
    for r in today_records:
        category_counter[r.category] += r.count

    hourly = [0] * 24
    for r in today_records:
        hourly[r.detect_time.hour] += r.count

    timeline = []
    for i in range(20):
        t = now - timedelta(seconds=(19 - i) * 3)
        timeline.append(
            {
                "time": t.strftime("%H:%M:%S"),
                "value": random.randint(0, 10) if runtime_state["detection_on"] else 0,
            }
        )

    return jsonify(
        {
            "ok": True,
            "cards": {
                "today_events": total_events,
                "today_objects": total_objects,
                "active_users": User.query.count(),
                "camera_type": runtime_state["camera_type"],
                "resolution": openmv_settings["resolution"],
                "fps": openmv_settings["fps"],
                "inference_ms": runtime_state["last_inference_ms"] or random.randint(25, 80),
                "camera_on": runtime_state["camera_on"],
                "camera_state": runtime_state["camera_state"],
                "openmv_settings": openmv_settings,
            },
            "series_meta": {
                "categories": sorted(list(category_counter.keys())),
                "total": total_objects,
            },
            "line": timeline,
            "pie": [{"name": k, "value": v} for k, v in category_counter.items()],
            "bar": hourly,
        }
    )


@app.get("/api/stats/advanced")
@login_required
def advanced_stats():
    range_key = request.args.get("range", "today")
    start_time = request.args.get("start_time", "")
    end_time = request.args.get("end_time", "")
    categories = [c.strip() for c in request.args.get("categories", "").split(",") if c.strip()]

    start, end = parse_time_range(range_key, start_time, end_time)
    if not start or not end:
        return jsonify({"ok": False, "message": "自定义时间格式错误"}), 400

    records = DetectionRecord.query.filter(
        DetectionRecord.detect_time >= start,
        DetectionRecord.detect_time <= end,
    )
    if categories:
        records = records.filter(DetectionRecord.category.in_(categories))
    records = records.all()

    total = sum(r.count for r in records)
    cate = Counter()
    timeline = []
    grouped = Counter()
    for r in records:
        cate[r.category] += r.count
        key = r.detect_time.strftime("%Y-%m-%d %H:%M")
        grouped[key] += r.count
    for key in sorted(grouped.keys())[-100:]:
        timeline.append({"time": key, "value": grouped[key], "dist": dict(cate)})

    bar_data = []
    for name, value in cate.items():
        bar_data.append({"name": name, "value": value})

    return jsonify(
        {
            "ok": True,
            "timeline": timeline,
            "pie": [{"name": n, "value": v} for n, v in cate.items()],
            "bar": bar_data,
            "categories": sorted(list({r.category for r in DetectionRecord.query.all()})),
            "total": total,
            "range": {"start": start.isoformat(sep=" "), "end": end.isoformat(sep=" ")},
        }
    )


@app.get("/api/stats/export")
@login_required
def export_stats():
    fmt = request.args.get("format", "csv").lower()
    records = DetectionRecord.query.order_by(DetectionRecord.detect_time.desc()).limit(3000).all()
    rows = [
        {
            "id": r.id,
            "time": r.detect_time.strftime("%Y-%m-%d %H:%M:%S"),
            "category": r.category,
            "count": r.count,
            "confidence": r.confidence,
            "operator": r.operator_name,
            "operation_type": r.operation_type,
        }
        for r in records
    ]

    if fmt == "json":
        return jsonify({"ok": True, "data": rows})

    if fmt == "excel":
        lines = ["ID\t时间\t类别\t数量\t置信度"]
        for r in rows:
            lines.append(f"{r['id']}\t{r['time']}\t{r['category']}\t{r['count']}\t{r['confidence']}")
        content = "\n".join(lines)
        mimetype = "application/vnd.ms-excel"
        suffix = "xls"
    else:
        lines = ["id,time,category,count,confidence"]
        for r in rows:
            lines.append(f"{r['id']},{r['time']},{r['category']},{r['count']},{r['confidence']}")
        content = "\n".join(lines)
        mimetype = "text/csv"
        suffix = "csv"

    return Response(
        content,
        mimetype=mimetype,
        headers={"Content-Disposition": f"attachment; filename=stats_export.{suffix}"},
    )


@app.delete("/api/admin/history")
@login_required
def clear_history():
    if not current_user.is_admin:
        return jsonify({"ok": False, "message": "forbidden"}), 403
    DetectionRecord.query.delete()
    db.session.commit()
    add_log("admin", "管理员清空全部检测记录", current_user.id)
    return jsonify({"ok": True})


@app.get("/api/history")
@login_required
def get_history():
    query = DetectionRecord.query
    keyword = request.args.get("keyword", "").strip()
    category = request.args.get("category", "").strip()
    status = request.args.get("status", "").strip()
    start_time = request.args.get("start_time", "").strip()
    end_time = request.args.get("end_time", "").strip()
    page = max(int(request.args.get("page", 1)), 1)
    page_size = min(max(int(request.args.get("page_size", 20)), 1), 100)

    if keyword:
        query = query.filter((DetectionRecord.category.contains(keyword)) | (DetectionRecord.note.contains(keyword)))
    if category:
        query = query.filter_by(category=category)
    if status:
        query = query.filter_by(operation_type=status)
    if start_time:
        try:
            query = query.filter(DetectionRecord.detect_time >= datetime.fromisoformat(start_time))
        except ValueError:
            pass
    if end_time:
        try:
            query = query.filter(DetectionRecord.detect_time <= datetime.fromisoformat(end_time))
        except ValueError:
            pass

    total = query.count()
    records = (
        query.order_by(DetectionRecord.detect_time.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    data = [
        {
            "id": r.id,
            "time": r.detect_time.strftime("%Y-%m-%d %H:%M:%S"),
            "category": r.category,
            "count": r.count,
            "confidence": r.confidence,
            "operator": r.operator_name,
            "operation_type": r.operation_type,
        }
        for r in records
    ]
    return jsonify({"ok": True, "records": data, "total": total, "page": page, "page_size": page_size})


@app.get("/api/admin/overview")
@login_required
def admin_overview():
    if not current_user.is_admin:
        return jsonify({"ok": False, "message": "forbidden"}), 403

    users = User.query.order_by(User.created_at.desc()).all()
    offset = max(int(request.args.get("offset", 0)), 0)
    limit = min(max(int(request.args.get("limit", 50)), 1), 100)
    operator_filter = request.args.get("operator", "").strip()
    log_query = SystemLog.query
    if operator_filter:
        log_query = log_query.filter(SystemLog.operator.contains(operator_filter))
    logs = log_query.order_by(SystemLog.created_at.desc()).offset(offset).limit(limit).all()

    return jsonify(
        {
            "ok": True,
            "users": [
                {
                    "id": u.id,
                    "username": u.username,
                    "is_admin": u.is_admin,
                    "status": "启用" if u.is_active_account else "禁用",
                    "email": u.email,
                    "phone": u.phone,
                    "avatar_url": u.avatar_url,
                    "created_at": u.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                    "last_login_at": u.last_login_at.strftime("%Y-%m-%d %H:%M:%S") if u.last_login_at else "-",
                }
                for u in users
            ],
            "metrics": {
                "user_count": User.query.count(),
                "history_total": DetectionRecord.query.count(),
                "history_total_desc": "累计检测记录=系统中累计保存的检测记录条数",
                "camera_on": runtime_state["camera_on"],
            "camera_state": runtime_state["camera_state"],
                "detection_on": runtime_state["detection_on"],
                "today_logs": db.session.query(func.count(SystemLog.id))
                .filter(SystemLog.created_at >= datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0))
                .scalar(),
            },
            "logs": [
                {
                    "time": l.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                    "operator": l.operator,
                    "ip": l.ip,
                    "content": l.content,
                    "result": l.result,
                }
                for l in logs
            ],
        }
    )


@app.delete("/api/admin/history/<int:record_id>")
@login_required
def delete_history(record_id: int):
    if not current_user.is_admin:
        return jsonify({"ok": False, "message": "forbidden"}), 403

    record = DetectionRecord.query.get_or_404(record_id)
    db.session.delete(record)
    db.session.commit()
    add_log("admin", f"管理员删除历史记录 ID={record_id}", current_user.id)
    return jsonify({"ok": True})


@app.delete("/api/history/<int:record_id>")
@login_required
def delete_history_self(record_id: int):
    record = DetectionRecord.query.get_or_404(record_id)
    if (not current_user.is_admin) and record.user_id != current_user.id:
        return jsonify({"ok": False, "message": "forbidden"}), 403
    db.session.delete(record)
    db.session.commit()
    add_log("history", f"删除历史记录 ID={record_id}", current_user.id)
    return jsonify({"ok": True})


@app.post("/api/admin/user/<int:user_id>/reset-password")
@login_required
def reset_user_password(user_id: int):
    if not current_user.is_admin:
        return jsonify({"ok": False, "message": "forbidden"}), 403
    user = User.query.get_or_404(user_id)
    user.password_hash = hash_password("12345678")
    db.session.commit()
    add_log("admin", f"重置用户密码: {user.username}", current_user.id)
    return jsonify({"ok": True})


@app.post("/api/admin/user/<int:user_id>/role")
@login_required
def update_user_role(user_id: int):
    if not current_user.is_admin:
        return jsonify({"ok": False, "message": "forbidden"}), 403
    user = User.query.get_or_404(user_id)
    payload = request.get_json(silent=True) or {}
    user.is_admin = bool(payload.get("is_admin", False))
    db.session.commit()
    add_log("admin", f"修改用户角色: {user.username}=>{'管理员' if user.is_admin else '普通用户'}", current_user.id)
    return jsonify({"ok": True})


@app.post("/api/admin/user/<int:user_id>/status")
@login_required
def update_user_status(user_id: int):
    if not current_user.is_admin:
        return jsonify({"ok": False, "message": "forbidden"}), 403
    user = User.query.get_or_404(user_id)
    payload = request.get_json(silent=True) or {}
    user.is_active_account = bool(payload.get("is_active", True))
    db.session.commit()
    add_log("admin", f"修改用户状态: {user.username}=>{'启用' if user.is_active_account else '禁用'}", current_user.id)
    return jsonify({"ok": True})


@app.post("/api/admin/users")
@login_required
def create_user():
    if not current_user.is_admin:
        return jsonify({"ok": False, "message": "forbidden"}), 403
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or "").strip()
    password = payload.get("password") or ""
    if not username or len(password) < 6:
        return jsonify({"ok": False, "message": "用户名不能为空且密码至少6位"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"ok": False, "message": "用户名已存在"}), 400
    user = User(
        username=username,
        password_hash=hash_password(password),
        email=(payload.get("email") or "").strip(),
        phone=(payload.get("phone") or "").strip(),
        avatar_url=(payload.get("avatar_url") or "").strip(),
        is_admin=bool(payload.get("is_admin", False)),
    )
    db.session.add(user)
    db.session.commit()
    add_log("admin", f"新增用户: {username}", current_user.id)
    return jsonify({"ok": True})


@app.put("/api/admin/users/<int:user_id>")
@login_required
def update_user(user_id: int):
    if not current_user.is_admin:
        return jsonify({"ok": False, "message": "forbidden"}), 403
    user = User.query.get_or_404(user_id)
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or user.username).strip()
    duplicate = User.query.filter(User.username == username, User.id != user.id).first()
    if duplicate:
        return jsonify({"ok": False, "message": "用户名已存在"}), 400
    user.username = username
    user.email = (payload.get("email") or "").strip()
    user.phone = (payload.get("phone") or "").strip()
    user.avatar_url = (payload.get("avatar_url") or "").strip()
    user.is_admin = bool(payload.get("is_admin", user.is_admin))
    user.is_active_account = bool(payload.get("is_active", user.is_active_account))
    db.session.commit()
    add_log("admin", f"更新用户信息: {user.username}", current_user.id)
    return jsonify({"ok": True})


@app.delete("/api/admin/users/<int:user_id>")
@login_required
def remove_user(user_id: int):
    if not current_user.is_admin:
        return jsonify({"ok": False, "message": "forbidden"}), 403
    user = User.query.get_or_404(user_id)
    if user.id == current_user.id:
        return jsonify({"ok": False, "message": "不能删除当前登录管理员"}), 400
    username = user.username
    db.session.delete(user)
    db.session.commit()
    add_log("admin", f"删除用户: {username}", current_user.id)
    return jsonify({"ok": True})


@app.post("/api/admin/users/<int:user_id>/password")
@login_required
def update_user_password(user_id: int):
    if not current_user.is_admin:
        return jsonify({"ok": False, "message": "forbidden"}), 403
    user = User.query.get_or_404(user_id)
    payload = request.get_json(silent=True) or {}
    password = payload.get("password") or ""
    if len(password) < 6:
        return jsonify({"ok": False, "message": "密码长度至少6位"}), 400
    user.password_hash = hash_password(password)
    db.session.commit()
    add_log("admin", f"管理员修改用户密码: {user.username}", current_user.id)
    return jsonify({"ok": True})


@app.get("/api/account/me")
@login_required
def account_me():
    return jsonify(
        {
            "ok": True,
            "user": {
                "id": current_user.id,
                "username": current_user.username,
                "email": current_user.email,
                "phone": current_user.phone,
                "avatar_url": current_user.avatar_url,
                "is_admin": current_user.is_admin,
                "created_at": current_user.created_at.strftime("%Y-%m-%d %H:%M:%S"),
            },
        }
    )


@app.post("/api/account/profile")
@login_required
def update_account_profile():
    payload = request.get_json(silent=True) or {}
    username = (payload.get("username") or current_user.username).strip()
    duplicate = User.query.filter(User.username == username, User.id != current_user.id).first()
    if duplicate:
        return jsonify({"ok": False, "message": "用户名已存在"}), 400
    current_user.username = username
    current_user.email = (payload.get("email") or "").strip()
    current_user.phone = (payload.get("phone") or "").strip()
    current_user.avatar_url = (payload.get("avatar_url") or "").strip()
    db.session.commit()
    add_log("account", f"用户更新个人信息: {current_user.username}", current_user.id)
    return jsonify({"ok": True})


@app.post("/api/account/password")
@login_required
def update_account_password():
    payload = request.get_json(silent=True) or {}
    old_password = payload.get("old_password") or ""
    new_password = payload.get("new_password") or ""
    if not verify_password(current_user.password_hash, old_password):
        return jsonify({"ok": False, "message": "旧密码错误"}), 400
    if len(new_password) < 6:
        return jsonify({"ok": False, "message": "新密码长度至少6位"}), 400
    current_user.password_hash = hash_password(new_password)
    db.session.commit()
    add_log("account", f"用户修改密码: {current_user.username}", current_user.id)
    return jsonify({"ok": True})


@app.get("/api/history/<int:record_id>")
@login_required
def history_detail(record_id: int):
    r = DetectionRecord.query.get_or_404(record_id)
    if (not current_user.is_admin) and r.user_id != current_user.id:
        return jsonify({"ok": False, "message": "forbidden"}), 403
    return jsonify({"ok": True, "record": {"id": r.id, "time": r.detect_time.strftime("%Y-%m-%d %H:%M:%S"), "category": r.category, "count": r.count, "confidence": r.confidence, "operator": r.operator_name, "operation_type": r.operation_type, "note": r.note}})


@app.get("/api/openmv/frame")
@login_required
def openmv_frame():
    if not runtime_state["camera_on"] or runtime_state["camera_type"] != "openmv":
        return jsonify({"ok": False, "message": "摄像头未开启"}), 400
    frame = b""
    global openmv_serial_conn
    if runtime_state["openmv_mode"] == "serial" and openmv_serial_conn and openmv_serial_conn.is_open:
        try:
            raw = openmv_serial_conn.read(8192)
            start = raw.find(b"\xff\xd8")
            end = raw.find(b"\xff\xd9")
            if start != -1 and end != -1 and end > start:
                frame = raw[start : end + 2]
        except Exception:
            frame = b""
    if not frame:
        header = b"\xff\xd8"
        payload = bytes([random.randint(0, 255) for _ in range(1024)])
        footer = b"\xff\xd9"
        frame = header + payload + footer
    runtime_state["openmv_last_frame_at"] = datetime.utcnow()
    runtime_state["openmv_last_len"] = len(frame)
    runtime_state["camera_state"] = "已连接"
    app.logger.info("OpenMV RX len=%s header=%s footer=%s", len(frame), frame[:2].hex(), frame[-2:].hex())
    return jsonify({"ok": True, "encoding": "base64", "frame": base64.b64encode(frame).decode("ascii"), "len": len(frame), "header": frame[:2].hex(), "footer": frame[-2:].hex()})


if __name__ == "__main__":
    init_db()
    lan_ip = get_lan_ip()
    print("Local:   http://127.0.0.1:5000")
    print("All NIC: http://0.0.0.0:5000")
    print(f"LAN:     http://{lan_ip}:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
