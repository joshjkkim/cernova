import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent / ".env")

DATABASE_URL = os.environ["DATABASE_URL"]
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
