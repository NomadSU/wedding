import os
import sqlite3
from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Dict, List

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from jinja2 import Environment, FileSystemLoader, select_autoescape
from openpyxl import Workbook
import secrets

APP_DIR = os.path.dirname(os.path.abspath(__file__))
TEMPLATES_DIR = os.path.join(APP_DIR, "templates")

env = Environment(
    loader=FileSystemLoader(TEMPLATES_DIR),
    autoescape=select_autoescape(["html", "xml"]),
)

security = HTTPBasic()

def get_settings() -> Dict[str, str]:
    return {
        "ADMIN_USER": os.getenv("ADMIN_USER", "admin"),
        "ADMIN_PASS": os.getenv("ADMIN_PASS", "197288zz"),
        "DB_PATH": os.getenv("DB_PATH", "/data/rsvp.db"),
    }

def require_admin(credentials: HTTPBasicCredentials = Depends(security)) -> None:
    s = get_settings()
    ok_user = secrets.compare_digest(credentials.username or "", s["ADMIN_USER"])
    ok_pass = secrets.compare_digest(credentials.password or "", s["ADMIN_PASS"])
    if not (ok_user and ok_pass):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized",
            headers={"WWW-Authenticate": "Basic"},
        )

def db_connect() -> sqlite3.Connection:
    s = get_settings()
    os.makedirs(os.path.dirname(s["DB_PATH"]), exist_ok=True)
    conn = sqlite3.connect(s["DB_PATH"])
    conn.row_factory = sqlite3.Row
    return conn

def db_init() -> None:
    conn = db_connect()
    try:
        conn.execute(
            '''
            CREATE TABLE IF NOT EXISTS rsvp_responses (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at TEXT NOT NULL,
                full_name TEXT NOT NULL,
                with_partner INTEGER NOT NULL DEFAULT 0,
                attending INTEGER NOT NULL DEFAULT 1
            );
            '''
        )
        # Миграции (на случай если база уже создана старой версией)
        cols = {row[1] for row in conn.execute("PRAGMA table_info('rsvp_responses')")}
        if 'attending' not in cols:
            conn.execute("ALTER TABLE rsvp_responses ADD COLUMN attending INTEGER NOT NULL DEFAULT 1")
            # Старые ответы не содержали поля присутствия; считаем, что по умолчанию люди планировали прийти.
            conn.execute("UPDATE rsvp_responses SET attending = 1 WHERE attending IS NULL")
        conn.commit()
    finally:
        conn.close()

app = FastAPI(title="InviteForWedd API", version="1.0.0")

@app.on_event("startup")
def _startup() -> None:
    db_init()

@app.get("/health", response_class=JSONResponse)
def health() -> Dict[str, Any]:
    return {"ok": True}

@app.post("/api/rsvp", response_class=JSONResponse)
async def create_rsvp(payload: Dict[str, Any], request: Request) -> Dict[str, Any]:
    full_name = str(payload.get("full_name", "")).strip()
    if "attending" not in payload:
        raise HTTPException(status_code=400, detail="attending is required")
    attending_raw = payload.get("attending")
    if not isinstance(attending_raw, bool):
        raise HTTPException(status_code=400, detail="attending must be boolean")
    attending = attending_raw

    if not full_name:
        raise HTTPException(status_code=400, detail="full_name is required")
    if len(full_name) > 200:
        raise HTTPException(status_code=400, detail="full_name is too long")

    created_at = datetime.now(timezone.utc).astimezone().strftime("%Y-%m-%d %H:%M:%S")

    conn = db_connect()
    try:
        conn.execute(
            "INSERT INTO rsvp_responses (created_at, full_name, with_partner, attending) VALUES (?, ?, ?, ?)",
            (created_at, full_name, 0, 1 if attending else 0),
        )
        conn.commit()
    finally:
        conn.close()

    return {"ok": True, "message": "Спасибо! Ответ сохранён."}

def fetch_rows() -> List[sqlite3.Row]:
    conn = db_connect()
    try:
        cur = conn.execute(
            "SELECT id, created_at, full_name, attending FROM rsvp_responses ORDER BY id DESC"
        )
        return list(cur.fetchall())
    finally:
        conn.close()

def fetch_row(response_id: int) -> sqlite3.Row | None:
    conn = db_connect()
    try:
        cur = conn.execute(
            "SELECT id, created_at, full_name, attending FROM rsvp_responses WHERE id = ?",
            (response_id,),
        )
        row = cur.fetchone()
        return row
    finally:
        conn.close()

@app.get("/admin", response_class=HTMLResponse, dependencies=[Depends(require_admin)])
def admin_page() -> HTMLResponse:
    rows = fetch_rows()
    tpl = env.get_template("admin.html")
    html = tpl.render(rows=rows, total=len(rows))
    return HTMLResponse(content=html, status_code=200)


@app.get("/admin/edit/{response_id}", response_class=HTMLResponse, dependencies=[Depends(require_admin)])
def admin_edit_page(response_id: int) -> HTMLResponse:
    row = fetch_row(response_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    tpl = env.get_template("edit.html")
    html = tpl.render(r=row)
    return HTMLResponse(content=html, status_code=200)


@app.post("/admin/edit/{response_id}", dependencies=[Depends(require_admin)])
async def admin_edit_save(response_id: int, request: Request) -> RedirectResponse:
    form = await request.form()
    full_name = str(form.get("full_name", "")).strip()
    attending_raw = str(form.get("attending", "")).strip()

    if not full_name:
        raise HTTPException(status_code=400, detail="full_name is required")
    if len(full_name) > 200:
        raise HTTPException(status_code=400, detail="full_name is too long")

    if attending_raw not in {"1", "0"}:
        raise HTTPException(status_code=400, detail="attending must be 1 or 0")
    attending = 1 if attending_raw == "1" else 0

    conn = db_connect()
    try:
        cur = conn.execute("SELECT id FROM rsvp_responses WHERE id = ?", (response_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Not found")
        conn.execute(
            "UPDATE rsvp_responses SET full_name = ?, attending = ? WHERE id = ?",
            (full_name, attending, response_id),
        )
        conn.commit()
    finally:
        conn.close()

    return RedirectResponse(url="/admin", status_code=303)


@app.post("/admin/delete/{response_id}", dependencies=[Depends(require_admin)])
def admin_delete(response_id: int) -> RedirectResponse:
    conn = db_connect()
    try:
        conn.execute("DELETE FROM rsvp_responses WHERE id = ?", (response_id,))
        conn.commit()
    finally:
        conn.close()
    return RedirectResponse(url="/admin", status_code=303)

@app.get("/admin/export.xlsx", dependencies=[Depends(require_admin)])
def export_xlsx() -> StreamingResponse:
    rows = fetch_rows()

    wb = Workbook()
    ws = wb.active
    ws.title = "RSVP"

    ws.append(["ID", "Дата/время", "Имя и фамилия", "Планирует присутствовать"])
    for r in rows[::-1]:
        ws.append([r["id"], r["created_at"], r["full_name"], "Да" if r["attending"] else "Нет"])

    bio = BytesIO()
    wb.save(bio)
    bio.seek(0)

    headers = {"Content-Disposition": 'attachment; filename="rsvp_responses.xlsx"'}
    return StreamingResponse(
        bio,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers=headers,
    )
