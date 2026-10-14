"""
T.R.A.S.H.: Waste Collection & Kagawad Proof Management System
Raspberry Pi 4B (4GB RAM) Local Cloud Storage & Proof Verification Server
"""
import os
import sqlite3
import datetime
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import requests

STORAGE_DIR = os.path.expanduser("~/trash_storage/photos")
REPORT_PHOTOS_DIR = os.path.join(STORAGE_DIR, "reports")
PROOF_PHOTOS_DIR = os.path.join(STORAGE_DIR, "proofs")
DB_FILE = os.path.expanduser("~/trash_storage/trash_database.db")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")

os.makedirs(REPORT_PHOTOS_DIR, exist_ok=True)
os.makedirs(PROOF_PHOTOS_DIR, exist_ok=True)

app = FastAPI(title="T.R.A.S.H. Raspberry Pi 4B Cloud Storage Server", version="2.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def init_db():
    conn = sqlite3.connect(DB_FILE)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS reports (
            id TEXT PRIMARY KEY,
            ticket_number TEXT,
            resident_name TEXT,
            resident_phone TEXT,
            is_elderly INTEGER,
            purok TEXT,
            street_address TEXT,
            house_number TEXT,
            landmark TEXT,
            lat REAL,
            lng REAL,
            waste_types TEXT,
            urgency TEXT,
            estimated_bags TEXT,
            notes TEXT,
            extra_message TEXT,
            photos TEXT,
            proof_photos TEXT,
            proof_notes TEXT,
            proof_kagawad_name TEXT,
            status TEXT,
            created_at TIMESTAMP,
            resolved_at TIMESTAMP,
            resolved_by TEXT,
            expires_at TIMESTAMP
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS saved_logbooks (
            id TEXT PRIMARY KEY,
            saved_by TEXT,
            total_records INTEGER,
            saved_at TIMESTAMP
        )
    """)
    conn.commit()
    conn.close()

init_db()

@app.get("/api/health")
def health_check():
    return {
        "status": "online",
        "system": "T.R.A.S.H. Raspberry Pi 4B",
        "storage": "Permanent Local & Cloud Database Disk"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
