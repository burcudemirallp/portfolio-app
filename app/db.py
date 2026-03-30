from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, declarative_base
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./portfolio.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={
        "check_same_thread": False,  # SQLite için şart
        "timeout": 30,  # 30 saniye lock bekleme (concurrent access)
    },
)

# SQLite WAL mode: concurrent read + write sorunlarını çözer
from sqlalchemy import event

@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA busy_timeout=30000")
    cursor.close()

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def run_migrations():
    """Mevcut veritabanına user_id sütunları ekler (yoksa). Varsayılan kullanıcı oluşturur."""
    from sqlalchemy import inspect
    inspector = inspect(engine)
    conn = engine.connect()

    def has_column(table, col):
        cols = [c["name"] for c in inspector.get_columns(table)]
        return col in cols

    # users tablosu yoksa migration gerekmez (create_all oluşturacak)
    if "users" not in inspector.get_table_names():
        conn.close()
        return

    # users.is_admin (admin paneli için)
    if not has_column("users", "is_admin"):
        conn.execute(text("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0"))
        conn.commit()
        # Varsayılan kullanıcıyı admin yap
        conn.execute(text("UPDATE users SET is_admin = 1 WHERE email = 'default@local.dev'"))
        conn.commit()

    # brokers.user_id
    if "brokers" in inspector.get_table_names() and not has_column("brokers", "user_id"):
        conn.execute(text("ALTER TABLE brokers ADD COLUMN user_id INTEGER"))
        conn.commit()
    # accounts.user_id
    if "accounts" in inspector.get_table_names() and not has_column("accounts", "user_id"):
        conn.execute(text("ALTER TABLE accounts ADD COLUMN user_id INTEGER"))
        conn.commit()
    # portfolio_snapshots.user_id
    if "portfolio_snapshots" in inspector.get_table_names() and not has_column("portfolio_snapshots", "user_id"):
        conn.execute(text("ALTER TABLE portfolio_snapshots ADD COLUMN user_id INTEGER"))
        conn.commit()

    # transactions.is_cash_flow (dışarıdan nakit akışı mı?)
    if "transactions" in inspector.get_table_names() and not has_column("transactions", "is_cash_flow"):
        conn.execute(text("ALTER TABLE transactions ADD COLUMN is_cash_flow INTEGER DEFAULT 0"))
        conn.execute(text("UPDATE transactions SET is_cash_flow = 0 WHERE is_cash_flow IS NULL"))
        conn.commit()

    # transactions.cash_flow_note (paranın kaynağı)
    if "transactions" in inspector.get_table_names() and not has_column("transactions", "cash_flow_note"):
        conn.execute(text("ALTER TABLE transactions ADD COLUMN cash_flow_note TEXT"))
        conn.commit()

    # transactions.cash_flow_amount (sabitlenmiş nakit akışı tutarı)
    if "transactions" in inspector.get_table_names() and not has_column("transactions", "cash_flow_amount"):
        conn.execute(text("ALTER TABLE transactions ADD COLUMN cash_flow_amount REAL"))
        conn.execute(text(
            "UPDATE transactions SET cash_flow_amount = quantity * price "
            "WHERE is_cash_flow = 1 AND cash_flow_amount IS NULL"
        ))
        conn.commit()

    # Varsayılan kullanıcı yoksa oluştur ve mevcut veriyi ona bağla
    from app.models import User
    from app import models
    session = SessionLocal()
    try:
        from app.services.auth import get_password_hash
        default_user = session.query(User).filter(User.email == "default@local.dev").first()
        if not default_user:
            default_user = User(
                email="default@local.dev",
                username="default",
                hashed_password=get_password_hash("default"),
                is_admin=True,
            )
            session.add(default_user)
            session.commit()
            session.refresh(default_user)
        else:
            if has_column("users", "is_admin") and not default_user.is_admin:
                default_user.is_admin = True
                session.commit()
        uid = default_user.id
        if has_column("brokers", "user_id"):
            conn.execute(text("UPDATE brokers SET user_id = :uid WHERE user_id IS NULL"), {"uid": uid})
            conn.commit()
        if has_column("accounts", "user_id"):
            conn.execute(text("UPDATE accounts SET user_id = :uid WHERE user_id IS NULL"), {"uid": uid})
            conn.commit()
        if has_column("portfolio_snapshots", "user_id"):
            conn.execute(text("UPDATE portfolio_snapshots SET user_id = :uid WHERE user_id IS NULL"), {"uid": uid})
            conn.commit()
    finally:
        session.close()
    conn.close()
