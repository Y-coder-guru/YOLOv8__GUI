from __future__ import annotations

import random
import socket
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path

from flask import (
    Flask,
    flash,
    jsonify,
    redirect,
    render_template,
    request,
    session,
    url_for,
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
from sqlalchemy import func
from werkzeug.security import check_password_hash, generate_password_hash

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
    created_at = db.Column(db.DateTime, default=datetime.utcnow)


class DetectionRecord(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)
    detect_time = db.Column(db.DateTime, default=datetime.utcnow, index=True)
    category = db.Column(db.String(50), nullable=False, index=True)
    count = db.Column(db.Integer, nullable=False)
    confidence = db.Column(db.Float, nullable=False)


class SystemLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=True)
    log_type = db.Column(db.String(50), nullable=False)
    content = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, index=True)


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

    def predict_from_frame(self, frame_meta: dict | None = None) -> dict:
        labels = ["person", "car", "bicycle", "dog", "cat", "truck"]
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
    "detection_on": False,
    "last_detection_time": None,
}


def add_log(log_type: str, content: str, user_id: int | None = None):
    db.session.add(SystemLog(log_type=log_type, content=content, user_id=user_id))
    db.session.commit()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with app.app_context():
        db.create_all()
        admin = User.query.filter_by(username="admin").first()
        if not admin:
            admin = User(
                username="admin",
                password_hash=generate_password_hash("admin123456"),
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
        if user and check_password_hash(user.password_hash, password):
            login_user(user, remember=remember)
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

        user = User(username=username, password_hash=generate_password_hash(password))
        db.session.add(user)
        db.session.commit()
        add_log("auth", f"新用户注册: {username}", user.id)
        flash("注册成功，请登录", "success")
        return redirect(url_for("login"))

    return render_template("register.html")


@app.route("/logout")
@login_required
def logout():
    add_log("auth", f"用户退出: {current_user.username}", current_user.id)
    logout_user()
    return redirect(url_for("login"))


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
    return jsonify(
        {
            "ok": True,
            "camera_on": runtime_state["camera_on"],
            "detection_on": runtime_state["detection_on"],
            "last_detection_time": runtime_state["last_detection_time"],
            "server_time": datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
        }
    )


@app.post("/api/camera/start")
@login_required
def start_camera():
    runtime_state["camera_on"] = True
    add_log("device", "摄像头已开启", current_user.id)
    return jsonify({"ok": True, "camera_on": True})


@app.post("/api/camera/stop")
@login_required
def stop_camera():
    runtime_state["camera_on"] = False
    runtime_state["detection_on"] = False
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

    result = model_service.predict_from_frame()
    runtime_state["last_detection_time"] = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    for category, count in result["counts"].items():
        avg_conf = sum(b["conf"] for b in result["boxes"] if b["label"] == category) / count
        db.session.add(
            DetectionRecord(
                user_id=current_user.id,
                category=category,
                count=count,
                confidence=round(avg_conf, 2),
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
                "camera_on": runtime_state["camera_on"],
            },
            "line": timeline,
            "pie": [{"name": k, "value": v} for k, v in category_counter.items()],
            "bar": hourly,
        }
    )


@app.get("/api/history")
@login_required
def get_history():
    query = DetectionRecord.query
    keyword = request.args.get("keyword", "").strip()
    category = request.args.get("category", "").strip()
    start_time = request.args.get("start_time", "").strip()
    end_time = request.args.get("end_time", "").strip()
    page = max(int(request.args.get("page", 1)), 1)
    page_size = min(max(int(request.args.get("page_size", 20)), 1), 100)

    if keyword:
        query = query.filter(DetectionRecord.category.contains(keyword))
    if category:
        query = query.filter_by(category=category)
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
    logs = SystemLog.query.order_by(SystemLog.created_at.desc()).limit(30).all()

    return jsonify(
        {
            "ok": True,
            "users": [
                {
                    "id": u.id,
                    "username": u.username,
                    "is_admin": u.is_admin,
                    "created_at": u.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                }
                for u in users
            ],
            "metrics": {
                "user_count": User.query.count(),
                "history_total": DetectionRecord.query.count(),
                "camera_on": runtime_state["camera_on"],
                "detection_on": runtime_state["detection_on"],
                "today_logs": db.session.query(func.count(SystemLog.id))
                .filter(SystemLog.created_at >= datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0))
                .scalar(),
            },
            "logs": [
                {
                    "time": l.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                    "type": l.log_type,
                    "content": l.content,
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


if __name__ == "__main__":
    init_db()
    lan_ip = get_lan_ip()
    print("Local:   http://127.0.0.1:5000")
    print("All NIC: http://0.0.0.0:5000")
    print(f"LAN:     http://{lan_ip}:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
