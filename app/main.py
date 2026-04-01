from fastapi import FastAPI, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from app.db import SessionLocal, engine, Base
from app import models, schemas
from app.services.pricing import fetch_instrument_price
from app.services.fx import FXService, get_usd_try_rate, convert_to_try

from sqlalchemy import func, case, and_
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional

app = FastAPI(title="Portfolio App")

# Benchmark veri cache'i — kullanıcı bazlı, fiyat güncellemesiyle doldurulur
_benchmark_cache: Dict[int, Dict[str, Any]] = {}


# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173", 
        "http://127.0.0.1:5173",
        "http://localhost:5174",  # Alternate Vite port
        "http://127.0.0.1:5174"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# TABLOLARI OLUŞTUR
Base.metadata.create_all(bind=engine)
from app.db import run_migrations
run_migrations()
print(f"Created tables: {list(Base.metadata.tables.keys())}")


# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.get("/health")
def health():
    return {"status": "ok"}


# ============= SCHEDULER =============
from app.services.scheduler import start_scheduler, stop_scheduler, get_scheduler_status

@app.on_event("startup")
def on_startup():
    start_scheduler(interval_minutes=30)

@app.on_event("shutdown")
def on_shutdown():
    stop_scheduler()

@app.get("/scheduler/status")
def scheduler_status():
    return get_scheduler_status()


# ============= AUTH =============
from app.services.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    get_current_admin_user,
)
from fastapi import status

@app.post("/auth/register", response_model=schemas.Token)
def register(payload: schemas.UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == payload.email).first():
        raise HTTPException(status_code=400, detail="Bu e-posta zaten kayıtlı")
    if db.query(models.User).filter(models.User.username == payload.username).first():
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten alınmış")
    user = models.User(
        email=payload.email,
        username=payload.username,
        hashed_password=get_password_hash(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(data={"sub": str(user.id)})
    return schemas.Token(
        access_token=token,
        user=schemas.UserOut.model_validate(user),
    )


@app.post("/auth/login", response_model=schemas.Token)
def login(payload: dict, db: Session = Depends(get_db)):
    email = payload.get("email") or payload.get("username")
    password = payload.get("password")
    if not email or not password:
        raise HTTPException(status_code=400, detail="E-posta ve şifre gerekli")
    user = db.query(models.User).filter(
        (models.User.email == email) | (models.User.username == email)
    ).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="E-posta veya şifre hatalı")
    token = create_access_token(data={"sub": str(user.id)})
    return schemas.Token(
        access_token=token,
        user=schemas.UserOut.model_validate(user),
    )


@app.get("/auth/me", response_model=schemas.UserOut)
def auth_me(current_user: models.User = Depends(get_current_user)):
    return current_user


# ============= ADMIN - Kullanıcı Yönetimi =============
@app.get("/admin/users", response_model=list[schemas.UserListOut])
def admin_list_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user),
):
    """Tüm kullanıcıları listele (sadece admin)."""
    users = db.query(models.User).order_by(models.User.created_at.desc()).all()
    return users


@app.delete("/admin/users/{user_id}")
def admin_delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user),
):
    """Kullanıcı sil (sadece admin). Kendi hesabını silemez."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Kendi hesabınızı silemezsiniz")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    db.delete(user)
    db.commit()
    return {"ok": True, "detail": "Kullanıcı silindi"}


@app.patch("/admin/users/{user_id}/admin")
def admin_toggle_admin(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user),
):
    """Kullanıcının admin yetkisini aç/kapat (sadece admin)."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Kendi admin yetkinizi kaldıramazsınız")
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    user.is_admin = not getattr(user, "is_admin", False)
    db.commit()
    db.refresh(user)
    return {"ok": True, "is_admin": user.is_admin}


@app.put("/admin/users/{user_id}")
def admin_update_user(
    user_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user),
):
    """Kullanıcının email, username veya şifresini güncelle (sadece admin)."""
    from app.services.auth import get_password_hash
    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if "email" in payload and payload["email"]:
        existing = db.query(models.User).filter(models.User.email == payload["email"], models.User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Bu email zaten kullanılıyor")
        user.email = payload["email"]
    if "username" in payload and payload["username"]:
        existing = db.query(models.User).filter(models.User.username == payload["username"], models.User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
        user.username = payload["username"]
    if "password" in payload and payload["password"]:
        user.hashed_password = get_password_hash(payload["password"])
    db.commit()
    db.refresh(user)
    return {"ok": True, "detail": "Kullanıcı güncellendi"}


@app.post("/admin/switch-user", response_model=schemas.Token)
def admin_switch_user(
    payload: schemas.SwitchUserRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin_user),
):
    """Admin: başka bir kullanıcı olarak oturum token'ı al (logout olmadan hesaba geç)."""
    target = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    token = create_access_token(data={"sub": str(target.id)})
    return schemas.Token(
        access_token=token,
        user=schemas.UserOut.model_validate(target),
    )


# ============= ACCOUNTS =============


@app.post("/accounts", response_model=schemas.AccountOut)
def create_account(
    payload: schemas.AccountCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account = models.Account(
        name=payload.name,
        base_currency=payload.base_currency,
        user_id=current_user.id,
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account


@app.get("/accounts", response_model=list[schemas.AccountOut])
def list_accounts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.Account).filter(models.Account.user_id == current_user.id).all()


@app.put("/accounts/{account_id}", response_model=schemas.AccountOut)
def update_account(
    account_id: int,
    payload: schemas.AccountCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    account.name = payload.name
    account.base_currency = payload.base_currency
    db.commit()
    db.refresh(account)
    return account


@app.delete("/accounts/{account_id}")
def delete_account(
    account_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account = db.query(models.Account).filter(
        models.Account.id == account_id,
        models.Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    transactions = db.query(models.Transaction).filter(models.Transaction.account_id == account_id).count()
    if transactions > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete account with {transactions} transactions")
    db.delete(account)
    db.commit()
    return {"message": "Account deleted successfully", "id": account_id}


# ============= INSTRUMENTS =============

@app.post("/instruments", response_model=schemas.InstrumentOut)
def create_instrument(
    payload: schemas.InstrumentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    existing = db.query(models.Instrument).filter(models.Instrument.symbol == payload.symbol).first()
    if existing:
        return existing

    inst = models.Instrument(**payload.model_dump())
    db.add(inst)
    db.commit()
    db.refresh(inst)
    return inst


@app.get("/instruments", response_model=list[schemas.InstrumentOut])
def list_instruments(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    instruments = db.query(models.Instrument).order_by(models.Instrument.symbol.asc()).all()
    
    # FX rate'leri önce bir kere çek (cache için)
    fx_cache = {
        "USD": FXService.get_rate("USD", "TRY"),
        "EUR": FXService.get_rate("EUR", "TRY"),
        "TRY": 1.0
    }
    
    # Tüm fiyatları tek query'de çek (N+1 problem'i çöz)
    instrument_ids = [inst.id for inst in instruments]
    latest_prices = {}
    
    if instrument_ids:
        # Her instrument için en son fiyatı bul (subquery ile)
        subq = (
            db.query(
                models.Price.instrument_id,
                func.max(models.Price.datetime).label('max_datetime')
            )
            .filter(models.Price.instrument_id.in_(instrument_ids))
            .group_by(models.Price.instrument_id)
            .subquery()
        )
        
        prices = (
            db.query(models.Price)
            .join(
                subq,
                and_(
                    models.Price.instrument_id == subq.c.instrument_id,
                    models.Price.datetime == subq.c.max_datetime
                )
            )
            .all()
        )
        
        for price in prices:
            latest_prices[price.instrument_id] = price
    
    # Her instrument için son fiyatı ekle
    result = []
    for inst in instruments:
        inst_dict = {
            "id": inst.id,
            "symbol": inst.symbol,
            "name": inst.name,
            "asset_type": inst.asset_type,
            "market": inst.market,
            "currency": inst.currency,
            "last_price": None,
            "last_price_try": None,
            "last_price_updated_at": None
        }
        
        last_price_row = latest_prices.get(inst.id)
        if last_price_row:
            last_price = float(last_price_row.price)
            price_currency = last_price_row.currency.upper()
            
            inst_dict["last_price"] = last_price
            inst_dict["last_price_updated_at"] = last_price_row.datetime
            
            # TRY'ye çevir (cache'den)
            fx_rate = fx_cache.get(price_currency, 1.0)
            if fx_rate:
                inst_dict["last_price_try"] = last_price * fx_rate
        
        result.append(inst_dict)
    
    return result


@app.put("/instruments/{instrument_id}", response_model=schemas.InstrumentOut)
def update_instrument(
    instrument_id: int,
    payload: schemas.InstrumentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    instrument = db.query(models.Instrument).filter(models.Instrument.id == instrument_id).first()
    if not instrument:
        raise HTTPException(status_code=404, detail="Instrument not found")
    
    instrument.symbol = payload.symbol
    instrument.name = payload.name
    instrument.asset_type = payload.asset_type
    instrument.market = payload.market
    instrument.currency = payload.currency
    db.commit()
    db.refresh(instrument)
    return instrument


@app.delete("/instruments/{instrument_id}")
def delete_instrument(
    instrument_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    instrument = db.query(models.Instrument).filter(models.Instrument.id == instrument_id).first()
    if not instrument:
        raise HTTPException(status_code=404, detail="Instrument not found")
    
    # Check if instrument has transactions
    transactions = db.query(models.Transaction).filter(models.Transaction.instrument_id == instrument_id).count()
    if transactions > 0:
        raise HTTPException(status_code=400, detail=f"Cannot delete instrument with {transactions} transactions")
    
    # Check if instrument has prices
    prices = db.query(models.Price).filter(models.Price.instrument_id == instrument_id).count()
    if prices > 0:
        # Delete prices first
        db.query(models.Price).filter(models.Price.instrument_id == instrument_id).delete()
    
    db.delete(instrument)
    db.commit()
    return {"message": "Instrument deleted successfully", "id": instrument_id}


def _user_account_ids(db: Session, user_id: int):
    return [a.id for a in db.query(models.Account.id).filter(models.Account.user_id == user_id).all()]


@app.post("/transactions", response_model=schemas.TransactionOut)
def create_transaction(
    payload: schemas.TransactionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account = db.query(models.Account).filter(
        models.Account.id == payload.account_id,
        models.Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Instrument kontrolü
    instrument = db.query(models.Instrument).filter(models.Instrument.id == payload.instrument_id).first()
    if not instrument:
        raise HTTPException(status_code=404, detail="Instrument not found")

    tx_data = payload.model_dump()
    if tx_data.get("is_cash_flow") == 1 and not tx_data.get("cash_flow_amount"):
        tx_data["cash_flow_amount"] = round(tx_data["quantity"] * tx_data["price"], 2)
    tx = models.Transaction(**tx_data)
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


@app.put("/transactions/{transaction_id}", response_model=schemas.TransactionOut)
def update_transaction(
    transaction_id: int,
    payload: schemas.TransactionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account_ids = _user_account_ids(db, current_user.id)
    tx = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.account_id.in_(account_ids),
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    account = db.query(models.Account).filter(
        models.Account.id == payload.account_id,
        models.Account.user_id == current_user.id,
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")
    
    # Instrument kontrolü
    instrument = db.query(models.Instrument).filter(models.Instrument.id == payload.instrument_id).first()
    if not instrument:
        raise HTTPException(status_code=404, detail="Instrument not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    update_data.pop("cash_flow_amount", None)
    for key, value in update_data.items():
        if value is not None or key == 'tag':
            setattr(tx, key, value)
    
    db.commit()
    db.refresh(tx)
    return tx


@app.patch("/transactions/{transaction_id}/cash-flow-note")
def update_cash_flow_note(
    transaction_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account_ids = _user_account_ids(db, current_user.id)
    tx = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.account_id.in_(account_ids),
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    tx.cash_flow_note = body.get("note", "")
    db.commit()
    return {"ok": True}


@app.patch("/transactions/{transaction_id}/cash-flow-amount")
def update_cash_flow_amount(
    transaction_id: int,
    body: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account_ids = _user_account_ids(db, current_user.id)
    tx = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.account_id.in_(account_ids),
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    tx.cash_flow_amount = body.get("amount", 0)
    db.commit()
    return {"ok": True}


@app.delete("/transactions/{transaction_id}")
def delete_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account_ids = _user_account_ids(db, current_user.id)
    tx = db.query(models.Transaction).filter(
        models.Transaction.id == transaction_id,
        models.Transaction.account_id.in_(account_ids),
    ).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    
    db.delete(tx)
    db.commit()
    return {"message": "Transaction deleted successfully", "id": transaction_id}




@app.get("/portfolio/positions", response_model=list[schemas.PositionOut])
def portfolio_positions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account_ids = _user_account_ids(db, current_user.id)
    if not account_ids:
        return []
    buy_qty = func.sum(case((models.Transaction.type == "buy", models.Transaction.quantity), else_=0.0))
    sell_qty = func.sum(case((models.Transaction.type == "sell", models.Transaction.quantity), else_=0.0))
    net_qty = (buy_qty - sell_qty).label("net_qty")
    buy_cost = func.sum(
        case(
            (models.Transaction.type == "buy", (models.Transaction.quantity * models.Transaction.price) + models.Transaction.fees),
            else_=0.0
        )
    ).label("buy_cost")
    buy_qty_only = func.sum(
        case((models.Transaction.type == "buy", models.Transaction.quantity), else_=0.0)
    ).label("buy_qty_only")
    rows = (
        db.query(
            models.Instrument.id.label("instrument_id"),
            models.Instrument.symbol,
            models.Instrument.name,
            models.Instrument.asset_type,
            models.Instrument.market,
            models.Instrument.currency,
            net_qty,
            buy_cost,
            buy_qty_only,
        )
        .join(models.Transaction, models.Transaction.instrument_id == models.Instrument.id)
        .filter(
            func.upper(models.Transaction.currency) == "TRY",
            models.Transaction.account_id.in_(account_ids),
        )
        .group_by(models.Instrument.id)
        .all()
    )

    # Bulk fetch latest prices (avoid N+1)
    all_instrument_ids = [r.instrument_id for r in rows]
    latest_prices = {}
    if all_instrument_ids:
        subq = (
            db.query(
                models.Price.instrument_id,
                func.max(models.Price.datetime).label('max_datetime')
            )
            .filter(models.Price.instrument_id.in_(all_instrument_ids))
            .group_by(models.Price.instrument_id)
            .subquery()
        )
        prices = (
            db.query(models.Price)
            .join(
                subq,
                and_(
                    models.Price.instrument_id == subq.c.instrument_id,
                    models.Price.datetime == subq.c.max_datetime
                )
            )
            .all()
        )
        for price in prices:
            latest_prices[price.instrument_id] = price

    result = []
    for r in rows:
        qty = float(r.net_qty or 0.0)
        cost = float(r.buy_cost or 0.0)
        buy_qty_val = float(r.buy_qty_only or 0.0)

        avg_cost = (cost / buy_qty_val) if buy_qty_val > 0 else 0.0

        last_price_row = latest_prices.get(r.instrument_id)
        last_price = float(last_price_row.price) if last_price_row else None

        market_value = (qty * last_price) if (last_price is not None) else None
        unrealized = (market_value - (avg_cost * qty)) if (market_value is not None) else None

        result.append(
            schemas.PositionOut(
                instrument_id=r.instrument_id,
                symbol=r.symbol,
                name=r.name,
                asset_type=r.asset_type,
                market=r.market,
                currency=r.currency,
                quantity=qty,
                cost_basis_try=cost,
                avg_cost_try=avg_cost,
                last_price_try=last_price,
                market_value_try=market_value,
                unrealized_pl_try=unrealized,
            )
        )

    return result


@app.get("/portfolio/summary", response_model=schemas.PortfolioSummary)
def portfolio_summary(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Portfolio özeti - TRY bazlı toplam değer, kar/zarar ve detaylı dağılım
    """
    account_ids = _user_account_ids(db, current_user.id)
    if not account_ids:
        return schemas.PortfolioSummary(
            total_cost_basis_try=0.0,
            total_market_value_try=0.0,
            total_unrealized_pl_try=0.0,
            total_unrealized_pl_percentage=0.0,
            position_count=0,
            allocation_by_asset_type=[],
            allocation_by_market=[],
            allocation_by_horizon=[],
            allocation_by_currency=[],
            allocation_by_tag=[],
            allocation_by_primary_tag=[],
            top_positions=[],
            top_gainers=[],
            top_losers=[],
            concentration_risks=[],
            metadata=schemas.DataMetadata(),
        )
    warnings = []
    instruments_without_price = []
    transactions = db.query(models.Transaction).filter(
        models.Transaction.account_id.in_(account_ids),
    ).order_by(models.Transaction.timestamp.asc(), models.Transaction.id.asc()).all()
    
    # Transaction'ları instrument bazında grupla
    instrument_transactions = {}
    for tx in transactions:
        if tx.instrument_id not in instrument_transactions:
            instrument_transactions[tx.instrument_id] = []
        instrument_transactions[tx.instrument_id].append(tx)

    # Tüm enstrümanları çek
    instruments = db.query(models.Instrument).all()
    instrument_map = {inst.id: inst for inst in instruments}

    # Bulk fetch latest prices (avoid N+1)
    all_instrument_ids = list(instrument_transactions.keys())
    latest_prices = {}
    if all_instrument_ids:
        subq = (
            db.query(
                models.Price.instrument_id,
                func.max(models.Price.datetime).label('max_datetime')
            )
            .filter(models.Price.instrument_id.in_(all_instrument_ids))
            .group_by(models.Price.instrument_id)
            .subquery()
        )
        prices = (
            db.query(models.Price)
            .join(
                subq,
                and_(
                    models.Price.instrument_id == subq.c.instrument_id,
                    models.Price.datetime == subq.c.max_datetime
                )
            )
            .all()
        )
        for price in prices:
            latest_prices[price.instrument_id] = price

    # Toplamlar
    total_cost = 0.0
    total_market_value = 0.0
    positions = []
    position_details = []  # Detaylı pozisyon listesi
    
    # Dağılımlar
    allocation_by_type = {}
    allocation_by_market = {}
    allocation_by_horizon = {}
    allocation_by_currency = {}
    allocation_by_tag = {}
    allocation_by_primary_tag = {}

    for instrument_id, txs in instrument_transactions.items():
        instrument = instrument_map.get(instrument_id)
        if not instrument:
            continue
        
        # Net pozisyon hesapla
        net_qty = 0.0
        total_buy_cost = 0.0
        total_buy_qty = 0.0
        
        horizon = None
        tag = None
        primary_tag = None
        secondary_tags = None
        
        for tx in txs:
            if tx.type == "buy":
                net_qty += tx.quantity
                
                # Transaction maliyetini hesapla
                tx_cost = (tx.quantity * tx.price) + (tx.fees or 0)
                
                # Eğer transaction USD/EUR cinsindeyse TRY'ye çevir
                tx_currency = tx.currency.upper() if tx.currency else "TRY"
                if tx_currency != "TRY":
                    fx_rate = FXService.get_rate(tx_currency, "TRY")
                    if fx_rate:
                        tx_cost = tx_cost * fx_rate
                    else:
                        print(f"Warning: {tx_currency}/TRY kuru bulunamadı, transaction #{tx.id}")
                
                total_buy_cost += tx_cost
                total_buy_qty += tx.quantity
                
                if tx.horizon:
                    horizon = tx.horizon
                
                if tx.tag:
                    tag = tx.tag
                
                if tx.primary_tag:
                    primary_tag = tx.primary_tag
                
                if tx.secondary_tags:
                    secondary_tags = tx.secondary_tags
                    
            elif tx.type == "sell":
                if total_buy_qty > 0:
                    avg = total_buy_cost / total_buy_qty
                    sold_cost = avg * tx.quantity
                    total_buy_cost -= sold_cost
                    total_buy_qty -= tx.quantity
                net_qty -= tx.quantity
        
        if net_qty <= 0:
            continue
        
        avg_cost = (total_buy_cost / total_buy_qty) if total_buy_qty > 0 else 0.0
        adjusted_cost = avg_cost * net_qty

        r = type('obj', (object,), {
            'instrument_id': instrument_id,
            'symbol': instrument.symbol,
            'name': instrument.name,
            'asset_type': instrument.asset_type,
            'market': instrument.market,
            'currency': instrument.currency,
            'net_qty': net_qty,
            'buy_cost': adjusted_cost,
            'horizon': horizon or "unknown",
            'tag': tag,
            'primary_tag': primary_tag,
            'secondary_tags': secondary_tags,
        })()
        last_price_row = latest_prices.get(r.instrument_id)
        last_price = float(last_price_row.price) if last_price_row else None
        original_currency = r.currency
        
        # Fiyat yoksa uyarı ekle
        if last_price is None:
            instruments_without_price.append(r.symbol)
        
        # Eğer fiyat USD/EUR cinsindeyse TRY'ye çevir
        if last_price and last_price_row:
            price_currency = last_price_row.currency.upper()
            if price_currency != "TRY":
                fx_rate = FXService.get_rate(price_currency, "TRY")
                if fx_rate:
                    last_price = last_price * fx_rate
                else:
                    warnings.append(f"{price_currency}/TRY kuru alınamadı, {r.symbol} için fiyat hesaplanamadı")
                    last_price = None

        market_value = (r.net_qty * last_price) if (last_price is not None) else None

        if market_value is not None:
            total_cost += r.buy_cost
            total_market_value += market_value
            
            # Dağılımları hesapla
            asset_type = r.asset_type or "unknown"
            market = r.market or "unknown"
            horizon = r.horizon
            currency = original_currency or "unknown"
            tag_value = r.tag if r.tag else "Etiket Yok"
            
            # Asset type
            if asset_type not in allocation_by_type:
                allocation_by_type[asset_type] = {"value": 0.0, "count": 0}
            allocation_by_type[asset_type]["value"] += market_value
            allocation_by_type[asset_type]["count"] += 1
            
            # Market
            if market not in allocation_by_market:
                allocation_by_market[market] = {"value": 0.0, "count": 0}
            allocation_by_market[market]["value"] += market_value
            allocation_by_market[market]["count"] += 1
            
            # Horizon
            if horizon not in allocation_by_horizon:
                allocation_by_horizon[horizon] = {"value": 0.0, "count": 0}
            allocation_by_horizon[horizon]["value"] += market_value
            allocation_by_horizon[horizon]["count"] += 1
            
            # Currency
            if currency not in allocation_by_currency:
                allocation_by_currency[currency] = {"value": 0.0, "count": 0}
            allocation_by_currency[currency]["value"] += market_value
            allocation_by_currency[currency]["count"] += 1
            
            # Tag
            if tag_value not in allocation_by_tag:
                allocation_by_tag[tag_value] = {"value": 0.0, "count": 0}
            allocation_by_tag[tag_value]["value"] += market_value
            allocation_by_tag[tag_value]["count"] += 1
            
            # Primary Tag - enstrümanın son primary_tag'ine göre tüm değeri ata
            ptag_key = r.primary_tag or "Etiket Yok"
            if ptag_key not in allocation_by_primary_tag:
                allocation_by_primary_tag[ptag_key] = {"value": 0.0, "count": 0}
            allocation_by_primary_tag[ptag_key]["value"] += market_value
            allocation_by_primary_tag[ptag_key]["count"] += 1
            
            positions.append({
                "instrument_id": r.instrument_id,
                "symbol": r.symbol,
                "market_value": market_value
            })
            
            # Detaylı pozisyon bilgisi
            unrealized_pl = market_value - r.buy_cost
            unrealized_pl_pct = (unrealized_pl / r.buy_cost * 100) if r.buy_cost > 0 else 0.0
            
            position_details.append(
                schemas.PositionSummary(
                    instrument_id=r.instrument_id,
                    symbol=r.symbol,
                    name=r.name,
                    asset_type=asset_type,
                    market=market,
                    tag=r.tag,
                    primary_tag=r.primary_tag,
                    secondary_tags=r.secondary_tags,
                    quantity=r.net_qty,
                    avg_cost_try=avg_cost,
                    last_price_try=last_price,
                    market_value_try=market_value,
                    unrealized_pl_try=unrealized_pl,
                    unrealized_pl_percentage=unrealized_pl_pct
                )
            )

    # Kar/Zarar
    total_unrealized_pl = total_market_value - total_cost
    total_unrealized_pl_pct = (total_unrealized_pl / total_cost * 100) if total_cost > 0 else 0.0

    # Yüzde hesapla ve listele
    def create_allocation_list(allocation_dict):
        result = []
        for key, data in allocation_dict.items():
            percentage = (data["value"] / total_market_value * 100) if total_market_value > 0 else 0.0
            result.append(
                schemas.AssetAllocation(
                    asset_type=key,
                    market_value_try=data["value"],
                    percentage=percentage,
                    count=data["count"]
                )
            )
        result.sort(key=lambda x: x.market_value_try, reverse=True)
        return result
    
    allocation_by_type_list = create_allocation_list(allocation_by_type)
    allocation_by_market_list = create_allocation_list(allocation_by_market)
    allocation_by_horizon_list = create_allocation_list(allocation_by_horizon)
    allocation_by_currency_list = create_allocation_list(allocation_by_currency)
    allocation_by_tag_list = create_allocation_list(allocation_by_tag)
    allocation_by_primary_tag_list = create_allocation_list(allocation_by_primary_tag)
    
    # Top positions (değere göre en büyük 10)
    top_positions = sorted(
        position_details, 
        key=lambda x: x.market_value_try or 0, 
        reverse=True
    )[:10]
    
    # Top gainers (kar yüzdesine göre en iyi 10)
    top_gainers = sorted(
        [p for p in position_details if (p.unrealized_pl_try or 0) > 0],
        key=lambda x: x.unrealized_pl_percentage or 0,
        reverse=True
    )[:10]
    
    # Top losers (zarar yüzdesine göre en kötü 10)
    top_losers = sorted(
        [p for p in position_details if (p.unrealized_pl_try or 0) < 0],
        key=lambda x: x.unrealized_pl_percentage or 0
    )[:10]
    
    # Metadata topla
    # 1. En son fiyat güncellemesi
    last_price_update = db.query(models.Price).order_by(models.Price.datetime.desc()).first()
    last_price_update_at = last_price_update.datetime if last_price_update else None
    
    # 2. USD/TRY ve EUR/TRY kurları
    usdtry_rate = None
    usdtry_updated_at = None
    eurtry_rate = None
    eurtry_updated_at = None
    
    try:
        usdtry_rate = FXService.get_rate("USD", "TRY")
        if usdtry_rate:
            usdtry_updated_at = datetime.now()
        else:
            warnings.append("USD/TRY kuru alınamadı")
    except Exception as e:
        warnings.append(f"USD/TRY kuru hatası: {str(e)}")
    
    try:
        eurtry_rate = FXService.get_rate("EUR", "TRY")
        if eurtry_rate:
            eurtry_updated_at = datetime.now()
        else:
            warnings.append("EUR/TRY kuru alınamadı")
    except Exception as e:
        warnings.append(f"EUR/TRY kuru hatası: {str(e)}")
    
    # 3. Fiyat bulunamayan enstrümanlar
    if instruments_without_price:
        warnings.append(f"{len(instruments_without_price)} enstrümanda fiyat bulunamadı: {', '.join(instruments_without_price[:5])}")
    
    # Metadata oluştur
    metadata = schemas.DataMetadata(
        last_price_update_at=last_price_update_at,
        usdtry_rate=usdtry_rate,
        usdtry_updated_at=usdtry_updated_at,
        eurtry_rate=eurtry_rate,
        eurtry_updated_at=eurtry_updated_at,
        data_warnings=warnings
    )

    # Konsantrasyon riski hesapla
    concentration_risks = []
    if total_market_value > 0:
        for pos in position_details:
            weight = (pos.market_value_try / total_market_value * 100) if pos.market_value_try else 0
            if weight > 15:
                level = "high" if weight > 25 else "medium"
                concentration_risks.append({
                    "symbol": pos.symbol,
                    "name": pos.name,
                    "weight": round(weight, 2),
                    "market_value_try": pos.market_value_try,
                    "level": level,
                    "type": "position"
                })
        
        # Asset type konsantrasyonu
        for alloc in allocation_by_type_list:
            if alloc.percentage > 50:
                concentration_risks.append({
                    "symbol": alloc.asset_type,
                    "name": f"{alloc.asset_type} varlık sınıfı",
                    "weight": round(alloc.percentage, 2),
                    "market_value_try": alloc.market_value_try,
                    "level": "high" if alloc.percentage > 70 else "medium",
                    "type": "asset_type"
                })

    return schemas.PortfolioSummary(
        total_cost_basis_try=total_cost,
        total_market_value_try=total_market_value,
        total_unrealized_pl_try=total_unrealized_pl,
        total_unrealized_pl_percentage=total_unrealized_pl_pct,
        position_count=len(positions),
        allocation_by_asset_type=allocation_by_type_list,
        allocation_by_market=allocation_by_market_list,
        allocation_by_horizon=allocation_by_horizon_list,
        allocation_by_currency=allocation_by_currency_list,
        allocation_by_tag=allocation_by_tag_list,
        allocation_by_primary_tag=allocation_by_primary_tag_list,
        positions=position_details,
        top_positions=top_positions,
        top_gainers=top_gainers,
        top_losers=top_losers,
        concentration_risks=concentration_risks,
        metadata=metadata
    )

@app.get("/debug/transactions")
def debug_transactions(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account_ids = _user_account_ids(db, current_user.id)
    if not account_ids:
        return []

    sold_buy_ids = set(
        row[0] for row in
        db.query(models.SaleRecord.buy_transaction_id)
        .filter(models.SaleRecord.buy_transaction_id.isnot(None))
        .all()
    )

    rows = db.query(models.Transaction).filter(
        models.Transaction.account_id.in_(account_ids),
    ).order_by(models.Transaction.id.desc()).all()
    return [
        {
            "id": r.id,
            "instrument_id": r.instrument_id,
            "account_id": r.account_id,
            "type": r.type,
            "quantity": r.quantity,
            "price": r.price,
            "fees": r.fees,
            "taxes": getattr(r, "taxes", 0),
            "currency": r.currency,
            "horizon": r.horizon,
            "tag": r.tag,
            "primary_tag": getattr(r, "primary_tag", None),
            "secondary_tags": getattr(r, "secondary_tags", None),
            "is_cash_flow": getattr(r, "is_cash_flow", 0),
            "cash_flow_note": getattr(r, "cash_flow_note", None) or "",
            "cash_flow_amount": getattr(r, "cash_flow_amount", None),
            "is_sold": r.id in sold_buy_ids,
            "timestamp": str(r.timestamp),
        }
        for r in rows
    ]


@app.post("/prices", response_model=schemas.PriceOut)
def add_price(
    payload: schemas.PriceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Instrument kontrolü
    instrument = db.query(models.Instrument).filter(models.Instrument.id == payload.instrument_id).first()
    if not instrument:
        raise HTTPException(status_code=404, detail="Instrument not found")
    
    price = models.Price(
        instrument_id=payload.instrument_id,
        price=payload.price,
        currency=payload.currency,
        source=payload.source,
        datetime=datetime.now(),
    )
    db.add(price)
    db.commit()
    db.refresh(price)
    return price


@app.post("/prices/fetch/{instrument_id}")
def fetch_and_save_price(
    instrument_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Belirli bir enstrümanın fiyatını otomatik çeker ve kaydeder
    """
    from app.services.pricing import PriceFetcher
    
    # Instrument'ı bul
    instrument = db.query(models.Instrument).filter(models.Instrument.id == instrument_id).first()
    if not instrument:
        raise HTTPException(status_code=404, detail="Instrument not found")
    
    # Altın için özel işlem
    if instrument.asset_type.lower() in ["altın", "altin", "gold"]:
        # Symbol veya name'den ayar bilgisini çıkar
        purity = 24  # default
        symbol_upper = instrument.symbol.upper()
        name_upper = (instrument.name or "").upper()
        
        if "22" in symbol_upper or "22" in name_upper or "22 AYAR" in name_upper:
            purity = 22
        elif "18" in symbol_upper or "18" in name_upper or "18 AYAR" in name_upper:
            purity = 18
        elif "14" in symbol_upper or "14" in name_upper or "14 AYAR" in name_upper:
            purity = 14
        
        price_data = PriceFetcher.fetch_gold_price_per_gram(purity=purity, currency=instrument.currency)
    
    # Fon için özel işlem (TEFAS/BEFAS)
    elif instrument.asset_type.lower() in ["fon", "fund"] or instrument.market.upper() in ["TEFAS", "BEFAS"]:
        # Yöntem 1: TEFAS API
        price_data = PriceFetcher._fetch_tefas_fund_price(instrument.symbol)
        
        # Yöntem 2: Alternatif TEFAS API
        if not price_data:
            price_data = PriceFetcher._fetch_alternative_tefas_price(instrument.symbol)
        
        # Yöntem 3: Web Scraping
        if not price_data:
            price_data = PriceFetcher._fetch_tefas_price_by_scraping(instrument.symbol)
    
    else:
        # Fiyatı çek
        price_data = fetch_instrument_price(
            symbol=instrument.symbol,
            market=instrument.market,
            asset_type=instrument.asset_type
        )
    
    if not price_data:
        raise HTTPException(
            status_code=404, 
            detail=f"Could not fetch price for {instrument.symbol}"
        )
    
    # Veritabanına kaydet
    price = models.Price(
        instrument_id=instrument_id,
        price=price_data["price"],
        currency=price_data["currency"],
        source=price_data["source"],
        datetime=datetime.now(),
    )
    db.add(price)
    db.commit()
    db.refresh(price)
    
    return {
        "instrument": {
            "id": instrument.id,
            "symbol": instrument.symbol,
            "name": instrument.name
        },
        "price": price_data["price"],
        "currency": price_data["currency"],
        "source": price_data["source"]
    }


@app.get("/prices/gold/{purity}")
def get_gold_price(purity: int = 24):
    """
    Altın fiyatını gram/TRY olarak döndürür
    
    Args:
        purity: Altın ayarı (22, 24, 18, 14)
    """
    from app.services.pricing import PriceFetcher
    
    price_data = PriceFetcher.fetch_gold_price_per_gram(purity=purity, currency="TRY")
    
    if not price_data:
        raise HTTPException(status_code=404, detail="Altın fiyatı alınamadı")
    
    return price_data


@app.get("/prices/fund/{fund_code}")
def get_fund_price(fund_code: str):
    """
    TEFAS/BEFAS fon fiyatını döndürür
    
    Args:
        fund_code: Fon kodu (örn: AAK, TQA, AZE)
    """
    from app.services.pricing import PriceFetcher
    
    price_data = PriceFetcher._fetch_tefas_fund_price(fund_code)
    
    if not price_data:
        raise HTTPException(status_code=404, detail=f"Fon fiyatı alınamadı: {fund_code}. TEFAS'ta bu kodla fon bulunamadı.")
    
    return price_data


@app.get("/funds/search/{search_term}")
def search_funds(search_term: str):
    """
    TEFAS'ta fon arar
    
    Args:
        search_term: Aranacak terim (fon adı veya kodu)
    
    Returns:
        list: Bulunan fonların listesi
    """
    from app.services.pricing import PriceFetcher
    
    results = PriceFetcher.search_tefas_fund(search_term)
    
    return {
        "search_term": search_term,
        "count": len(results),
        "results": results
    }


@app.get("/crypto/search/{search_term}")
def search_crypto(search_term: str, limit: int = 20):
    """
    Binance'de kripto sembol arar
    
    Args:
        search_term: Aranacak terim (örn: BTC, ETH, BNB)
        limit: Maksimum sonuç sayısı (varsayılan: 20)
    
    Returns:
        dict: Bulunan kripto trading pair'lerinin listesi
    """
    from app.services.pricing import PriceFetcher
    
    results = PriceFetcher.search_binance_symbols(search_term, limit)
    
    return {
        "search_term": search_term,
        "count": len(results),
        "results": results
    }


@app.get("/crypto/price/{symbol}")
def get_crypto_price(symbol: str):
    """
    Binance'den kripto fiyatı çeker
    
    Args:
        symbol: Trading pair sembolü (örn: BTCUSDT, ETHUSDT)
                Eğer sadece BTC girilirse otomatik BTCUSDT'ye çevrilir
    
    Returns:
        dict: Fiyat bilgisi
    """
    from app.services.pricing import PriceFetcher
    
    price_data = PriceFetcher._fetch_binance_price(symbol)
    
    if not price_data:
        raise HTTPException(
            status_code=404,
            detail=f"Kripto fiyatı alınamadı: {symbol}. Binance'de bu sembol bulunamadı."
        )
    
    return price_data


@app.post("/prices/manual")
def add_manual_price(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Manuel fiyat girişi (Yahoo'da olmayan hisseler için)
    """
    instrument_id = payload.get("instrument_id")
    price = payload.get("price")
    
    if not instrument_id or not price:
        raise HTTPException(status_code=400, detail="instrument_id ve price gerekli")
    
    # Instrument kontrolü
    instrument = db.query(models.Instrument).filter(models.Instrument.id == instrument_id).first()
    if not instrument:
        raise HTTPException(status_code=404, detail="Instrument bulunamadı")
    
    # Fiyat kaydı oluştur
    price_record = models.Price(
        instrument_id=instrument_id,
        price=float(price),
        currency=instrument.currency,
        source="manual",
        datetime=datetime.now(),
    )
    db.add(price_record)
    db.commit()
    db.refresh(price_record)
    
    return {
        "message": f"{instrument.symbol} için manuel fiyat eklendi",
        "price": float(price),
        "currency": instrument.currency
    }


@app.post("/prices/manual-bulk")
def add_manual_prices_bulk(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Toplu manuel fiyat girişi (symbol bazlı)
    Örnek: {"GMSTRF": 314.5, "DMLKTG": 6.30}
    """
    prices_dict = payload.get("prices", {})
    
    if not prices_dict:
        raise HTTPException(status_code=400, detail="prices dict gerekli")
    
    results = {
        "success": [],
        "failed": []
    }
    
    for symbol, price in prices_dict.items():
        try:
            # Symbol'e göre instrument bul
            instrument = db.query(models.Instrument).filter(
                models.Instrument.symbol == symbol.upper()
            ).first()
            
            if not instrument:
                results["failed"].append({
                    "symbol": symbol,
                    "reason": "Instrument bulunamadı"
                })
                continue
            
            # Fiyat kaydı oluştur
            price_record = models.Price(
                instrument_id=instrument.id,
                price=float(price),
                currency=instrument.currency,
                source="manual_bulk",
                datetime=datetime.now(),
            )
            db.add(price_record)
            db.commit()
            db.refresh(price_record)
            
            results["success"].append({
                "symbol": symbol,
                "price": float(price),
                "currency": instrument.currency
            })
        except Exception as e:
            results["failed"].append({
                "symbol": symbol,
                "reason": str(e)
            })
    
    return results


@app.post("/prices/fetch-all")
def fetch_all_prices(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Tüm enstrümanların fiyatlarını otomatik çeker ve kaydeder (arka plan)
    """
    
    # Hemen döndür, arka planda çalışsın
    background_tasks.add_task(_fetch_all_prices_background, current_user.id)
    
    return {
        "status": "started",
        "message": "Fiyat güncelleme başlatıldı. Sayfayı yenileyerek sonuçları kontrol edebilirsiniz."
    }

_price_update_failures: dict[int, list[str]] = {}

def _fetch_all_prices_background(user_id: int):
    """Arka planda çalışan fiyat güncelleme fonksiyonu"""
    from app.services.pricing import PriceFetcher
    import time
    from datetime import datetime as _dt
    from app.db import SessionLocal
    import random
    from app import models
    
    db = SessionLocal()
    try:
        instruments = db.query(models.Instrument).all()
        
        instrument_dicts = [
            {
                "id": inst.id,
                "symbol": inst.symbol,
                "name": inst.name,
                "asset_type": inst.asset_type,
                "market": inst.market,
                "currency": inst.currency
            }
            for inst in instruments
        ]
        
        success_count = 0
        failed_count = 0
        failed_names = []
        
        for i, inst_dict in enumerate(instrument_dicts):
            result = _fetch_single_price(inst_dict)
            
            if i < len(instrument_dicts) - 1:
                wait_time = random.uniform(2.0, 4.0)
                time.sleep(wait_time)
            
            if result["success"]:
                try:
                    price = models.Price(
                        instrument_id=result["instrument_id"],
                        price=result["price_data"]["price"],
                        currency=result["price_data"]["currency"],
                        source=result["price_data"]["source"],
                        datetime=_dt.now(),
                    )
                    db.add(price)
                    db.commit()
                    success_count += 1
                except:
                    db.rollback()
                    failed_count += 1
                    failed_names.append(inst_dict["symbol"])
            else:
                failed_count += 1
                failed_names.append(inst_dict["symbol"])
        
        _price_update_failures[user_id] = failed_names
        print(f"[Background] Fiyat güncelleme tamamlandı: {success_count} başarılı, {failed_count} başarısız")

        try:
            total = len(instrument_dicts)
            if failed_count == 0:
                create_notification(
                    db, user_id, "system",
                    "Fiyat Güncelleme Tamamlandı",
                    f"Tüm fiyatlar başarıyla güncellendi. {success_count}/{total} enstrüman güncellendi.",
                    related_type="price_update",
                )
            else:
                fail_list = ", ".join(failed_names)
                create_notification(
                    db, user_id, "system",
                    "Fiyat Güncelleme Tamamlandı",
                    f"{success_count}/{total} başarılı, {failed_count} başarısız.\nGüncellenemeyen: {fail_list}",
                    related_type="price_update",
                )
        except Exception as e:
            print(f"[Background] Bildirim oluşturma hatası: {e}")

        # Benchmark cache'ini de yenile
        try:
            _refresh_benchmark_cache_background(user_id)
        except Exception as e:
            print(f"[Background] Benchmark cache yenileme hatası: {e}")
    finally:
        db.close()

def _fetch_single_price(instrument_dict):
    """Tek bir enstrüman için fiyat çek (background task için)"""
    from app.services.pricing import PriceFetcher
    try:
        if instrument_dict["asset_type"].lower() in ["altın", "altin", "gold"]:
            purity = 24
            if "22" in instrument_dict["symbol"] or "22" in instrument_dict["name"]:
                purity = 22
            elif "18" in instrument_dict["symbol"] or "18" in instrument_dict["name"]:
                purity = 18
            elif "14" in instrument_dict["symbol"] or "14" in instrument_dict["name"]:
                purity = 14
            price_data = PriceFetcher.fetch_gold_price_per_gram(purity=purity, currency=instrument_dict["currency"])
        elif instrument_dict["asset_type"].lower() in ["fon", "fund"] or instrument_dict["market"].upper() in ["TEFAS", "BEFAS"]:
            price_data = PriceFetcher._fetch_tefas_fund_price(instrument_dict["symbol"])
            if not price_data:
                price_data = PriceFetcher._fetch_alternative_tefas_price(instrument_dict["symbol"])
            if not price_data:
                price_data = PriceFetcher._fetch_tefas_price_by_scraping(instrument_dict["symbol"])
        else:
            from app.main import fetch_instrument_price
            price_data = fetch_instrument_price(
                symbol=instrument_dict["symbol"],
                market=instrument_dict["market"],
                asset_type=instrument_dict["asset_type"]
            )
        
        if price_data:
            return {"success": True, "instrument_id": instrument_dict["id"], "price_data": price_data}
        else:
            return {"success": False, "instrument_id": instrument_dict["id"], "reason": "Could not fetch price"}
    except Exception as e:
        return {"success": False, "instrument_id": instrument_dict["id"], "reason": str(e)}


# ============= SCANNER (TARAMA) =============
# ============= SCANNER (TARAMA) =============

@app.get("/scanner/bist-symbols")
def get_bist_symbols(db: Session = Depends(get_db)):
    """
    Taramada kullanılacak BIST sembollerini döner.
    Önce veritabanındaki BIST enstrümanları, yoksa varsayılan BIST listesi.
    """
    from app.services.scanner import BIST_SYMBOLS_DEFAULT
    instruments = db.query(models.Instrument).filter(
        func.lower(models.Instrument.market) == "bist"
    ).order_by(models.Instrument.symbol).all()
    symbols_from_db = [inst.symbol for inst in instruments]
    if symbols_from_db:
        return {"symbols": symbols_from_db, "source": "db"}
    return {"symbols": BIST_SYMBOLS_DEFAULT, "source": "default"}


@app.post("/scanner/bist-ema")
def run_bist_ema_scan(
    body: Optional[schemas.ScannerBistEmaRequest] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    BIST hisselerinde fiyatın EMA 20, 50 ve 100'ün üstünde olduğu hisseleri tarar.
    Varsayılan: Tüm BIST 30 listesi. use_my_instruments=True ise sadece portföydeki BIST hisseleri.
    """
    from app.services.scanner import scan_bist_above_ema, BIST_SYMBOLS_DEFAULT
    req = body or schemas.ScannerBistEmaRequest()
    ema_periods = req.ema_periods or [20, 50, 100]
    symbols = req.symbols
    source = "default"
    if not symbols:
        if getattr(req, "use_my_instruments", False):
            account_ids = _user_account_ids(db, current_user.id)
            if account_ids:
                inst_ids = [r[0] for r in db.query(models.Transaction.instrument_id).filter(
                    models.Transaction.account_id.in_(account_ids),
                ).distinct().all()]
                if inst_ids:
                    instruments = db.query(models.Instrument).filter(
                        models.Instrument.id.in_(inst_ids),
                        func.lower(models.Instrument.market) == "bist",
                    ).all()
                    symbols = [inst.symbol for inst in instruments]
                    source = "db"
        if not symbols:
            symbols = BIST_SYMBOLS_DEFAULT
    results = scan_bist_above_ema(symbols=symbols, ema_periods=ema_periods)
    return {
        "criteria": f"Fiyat > EMA {', '.join(map(str, ema_periods))}",
        "count": len(results),
        "source": source,
        "results": results,
    }


@app.post("/scanner/bist-volume")
def run_bist_volume_scan(
    body: Optional[schemas.ScannerBistVolumeRequest] = None,
    current_user: models.User = Depends(get_current_user),
):
    """
    BIST hisselerinde hacim artışı taraması.
    Hacim Oranı = Son Günün Hacmi / 20 Günlük Ortalama Hacim
    """
    from app.services.scanner import scan_bist_volume
    req = body or schemas.ScannerBistVolumeRequest()
    symbols = req.symbols or None  # None = tüm BIST (bigpara'dan dinamik)
    min_ratio = req.min_ratio
    lookback_days = req.lookback_days
    results = scan_bist_volume(symbols=symbols, min_ratio=min_ratio, lookback_days=lookback_days)
    return {
        "criteria": f"Hacim Oranı >= {min_ratio}x (son {lookback_days} gün)",
        "count": len(results),
        "lookback_days": lookback_days,
        "results": results,
    }


# ============= FX (DÖVIZ KURLARI) =============

@app.get("/fx/rates")
def get_fx_rates():
    """
    Tüm döviz kurlarını getirir (USD/TRY, EUR/TRY vb.)
    """
    usd_try = FXService.get_rate("USD", "TRY") or 34.0
    eur_try = FXService.get_rate("EUR", "TRY") or 37.0
    
    return {
        "USDTRY": usd_try,
        "EURTRY": eur_try,
        "timestamp": datetime.now().isoformat()
    }


# ============= PORTFOLIO SNAPSHOTS (ZAMAN BAZLI ANALİZ) =============

@app.post("/portfolio/snapshot")
def create_portfolio_snapshot(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Portföyün detaylı anlık görüntüsünü oluşturur (tüm pozisyonlar dahil)
    """
    from app.services.fx import FXService
    account_ids = _user_account_ids(db, current_user.id)
    if not account_ids:
        raise HTTPException(status_code=400, detail="Portföy boş, önce işlem ekleyin")
    summary = portfolio_summary(db=db, current_user=current_user)
    usd_try = FXService.get_rate("USD", "TRY")
    eur_try = FXService.get_rate("EUR", "TRY")
    transaction_count = db.query(models.Transaction).filter(
        models.Transaction.account_id.in_(account_ids),
    ).count()
    snapshot = models.PortfolioSnapshot(
        snapshot_date=datetime.now(),
        total_market_value=summary.total_market_value_try,
        total_cost_basis=summary.total_cost_basis_try,
        total_profit_loss=summary.total_unrealized_pl_try,
        total_profit_loss_pct=summary.total_unrealized_pl_percentage,
        transaction_count=transaction_count,
        position_count=summary.position_count,
        usd_try_rate=usd_try,
        eur_try_rate=eur_try,
        user_id=current_user.id,
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    all_transactions = db.query(models.Transaction).filter(
        models.Transaction.account_id.in_(account_ids),
    ).all()
    instrument_transactions = {}
    for tx in all_transactions:
        if tx.instrument_id not in instrument_transactions:
            instrument_transactions[tx.instrument_id] = []
        instrument_transactions[tx.instrument_id].append(tx)
    
    instruments_map = {inst.id: inst for inst in db.query(models.Instrument).all()}

    # Bulk fetch latest prices (avoid N+1)
    all_instrument_ids = list(instrument_transactions.keys())
    latest_prices = {}
    if all_instrument_ids:
        subq = (
            db.query(
                models.Price.instrument_id,
                func.max(models.Price.datetime).label('max_datetime')
            )
            .filter(models.Price.instrument_id.in_(all_instrument_ids))
            .group_by(models.Price.instrument_id)
            .subquery()
        )
        prices = (
            db.query(models.Price)
            .join(
                subq,
                and_(
                    models.Price.instrument_id == subq.c.instrument_id,
                    models.Price.datetime == subq.c.max_datetime
                )
            )
            .all()
        )
        for price in prices:
            latest_prices[price.instrument_id] = price

    for instrument_id, txs in instrument_transactions.items():
        instrument = instruments_map.get(instrument_id)
        if not instrument:
            continue
        
        # Net pozisyon hesapla
        net_qty = sum(tx.quantity for tx in txs if tx.type == "buy") - sum(tx.quantity for tx in txs if tx.type == "sell")
        if net_qty <= 0:
            continue
        
        # Maliyet hesapla
        total_buy_cost = 0.0
        total_buy_qty = 0.0
        primary_tag = None
        
        for tx in txs:
            if tx.type == "buy":
                tx_cost = (tx.quantity * tx.price) + (tx.fees or 0)
                tx_currency = tx.currency.upper() if tx.currency else "TRY"
                if tx_currency != "TRY":
                    from app.services.fx import FXService
                    fx_rate = FXService.get_rate(tx_currency, "TRY")
                    if fx_rate:
                        tx_cost = tx_cost * fx_rate
                
                total_buy_cost += tx_cost
                total_buy_qty += tx.quantity
                
                if tx.primary_tag:
                    primary_tag = tx.primary_tag
        
        avg_cost = (total_buy_cost / total_buy_qty) if total_buy_qty > 0 else 0.0

        latest_price = latest_prices.get(instrument_id)
        current_price = 0.0
        if latest_price:
            current_price = latest_price.price
            if latest_price.currency.upper() != "TRY":
                from app.services.fx import FXService
                fx_rate = FXService.get_rate(latest_price.currency.upper(), "TRY")
                if fx_rate:
                    current_price = current_price * fx_rate
        
        market_value = net_qty * current_price
        profit_loss = market_value - total_buy_cost
        profit_loss_pct = (profit_loss / total_buy_cost * 100) if total_buy_cost > 0 else 0
        
        position_snapshot = models.PositionSnapshot(
            portfolio_snapshot_id=snapshot.id,
            instrument_id=instrument_id,
            quantity=net_qty,
            avg_cost=avg_cost,
            current_price=current_price,
            market_value=market_value,
            profit_loss=profit_loss,
            profit_loss_pct=profit_loss_pct,
            primary_tag=primary_tag,
        )
        db.add(position_snapshot)
    
    db.commit()
    
    # Kaydedilen pozisyon sayısını hesapla
    saved_positions = db.query(models.PositionSnapshot).filter(
        models.PositionSnapshot.portfolio_snapshot_id == snapshot.id
    ).count()
    
    return {
        "snapshot_id": snapshot.id,
        "snapshot_date": snapshot.snapshot_date,
        "total_positions": saved_positions,
        "total_value": snapshot.total_market_value
    }



@app.get("/portfolio/performance/{period}")
def get_portfolio_performance(
    period: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    from datetime import timedelta
    period_map = {
        "1d": (1, "Son 1 gün"),
        "7d": (7, "Son 1 hafta"),
        "30d": (30, "Son 1 ay"),
        "90d": (90, "Son 3 ay"),
        "365d": (365, "Son 1 yıl")
    }
    if period not in period_map:
        raise HTTPException(status_code=400, detail="Geçersiz dönem. Kullanılabilir: 1d, 7d, 30d, 90d, 365d")
    days, label = period_map[period]
    target_date = datetime.now() - timedelta(days=days)
    current_summary = portfolio_summary(db=db, current_user=current_user)
    current_value = current_summary.total_market_value_try
    past_snapshot = (
        db.query(models.PortfolioSnapshot)
        .filter(
            models.PortfolioSnapshot.user_id == current_user.id,
            models.PortfolioSnapshot.snapshot_date >= target_date,
        )
        .order_by(models.PortfolioSnapshot.snapshot_date.asc())
        .first()
    )
    if not past_snapshot:
        past_snapshot = (
            db.query(models.PortfolioSnapshot)
            .filter(models.PortfolioSnapshot.user_id == current_user.id)
            .order_by(models.PortfolioSnapshot.snapshot_date.asc())
            .first()
        )
        
        if not past_snapshot:
            raise HTTPException(
                status_code=404, 
                detail="Karşılaştırma için geçmiş veri bulunamadı. Lütfen önce snapshot oluşturun."
            )
    
    previous_value = past_snapshot.total_market_value
    change_amount = current_value - previous_value
    change_percentage = (change_amount / previous_value * 100) if previous_value > 0 else 0
    
    # Gerçek dönem (snapshot tarihi ile şimdi arasındaki fark)
    actual_days = (datetime.now() - past_snapshot.snapshot_date).days
    
    return {
        "current_value": current_value,
        "previous_value": previous_value,
        "change_amount": change_amount,
        "change_percentage": change_percentage,
        "period_days": actual_days,
        "period_label": label,
        "snapshot_date": past_snapshot.snapshot_date,
        "current_date": datetime.now()
    }


def _interpolate_fx_rate(currency, prev_snap, curr_snap, tx_timestamp):
    """Snapshot FX kurlarından lineer interpolasyon ile tarihsel kur tahmini."""
    from app.services.fx import FXService

    rate_start, rate_end = None, None
    if currency == "USD":
        rate_start = prev_snap.usd_try_rate
        rate_end = curr_snap.usd_try_rate
    elif currency == "EUR":
        rate_start = prev_snap.eur_try_rate
        rate_end = curr_snap.eur_try_rate

    if rate_start and rate_end:
        total_secs = (curr_snap.snapshot_date - prev_snap.snapshot_date).total_seconds()
        if total_secs > 0:
            elapsed = (tx_timestamp - prev_snap.snapshot_date).total_seconds()
            frac = max(0.0, min(1.0, elapsed / total_secs))
            return rate_start + (rate_end - rate_start) * frac
        return rate_start

    return rate_start or rate_end or FXService.get_rate(currency, "TRY") or 1.0


# ==================== CASH FLOWS (TWR için bağımsız) ====================

@app.get("/cash-flows")
def list_cash_flows(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    rows = (
        db.query(models.CashFlow)
        .filter(models.CashFlow.user_id == current_user.id)
        .order_by(models.CashFlow.flow_date.desc())
        .all()
    )
    result = []
    for c in rows:
        amt_try = c.amount
        if c.currency and c.currency != "TRY":
            rate = FXService.get_rate(c.currency, "TRY")
            if rate:
                amt_try = c.amount * rate
        result.append({
            "id": c.id,
            "user_id": c.user_id,
            "flow_date": c.flow_date,
            "amount": c.amount,
            "currency": c.currency,
            "flow_type": c.flow_type,
            "note": c.note,
            "amount_try": round(amt_try, 2),
            "created_at": c.created_at,
        })
    return result


@app.post("/cash-flows", response_model=schemas.CashFlowOut)
def create_cash_flow(
    payload: schemas.CashFlowCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cf = models.CashFlow(user_id=current_user.id, **payload.model_dump())
    db.add(cf)
    db.commit()
    db.refresh(cf)
    return cf


@app.put("/cash-flows/{cf_id}", response_model=schemas.CashFlowOut)
def update_cash_flow(
    cf_id: int,
    payload: schemas.CashFlowCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cf = db.query(models.CashFlow).filter(
        models.CashFlow.id == cf_id,
        models.CashFlow.user_id == current_user.id,
    ).first()
    if not cf:
        raise HTTPException(status_code=404, detail="Cash flow not found")
    for k, v in payload.model_dump().items():
        setattr(cf, k, v)
    db.commit()
    db.refresh(cf)
    return cf


@app.delete("/cash-flows/{cf_id}")
def delete_cash_flow(
    cf_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    cf = db.query(models.CashFlow).filter(
        models.CashFlow.id == cf_id,
        models.CashFlow.user_id == current_user.id,
    ).first()
    if not cf:
        raise HTTPException(status_code=404, detail="Cash flow not found")
    db.delete(cf)
    db.commit()
    return {"ok": True}


@app.get("/portfolio/twr")
def get_portfolio_twr(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Time-Weighted Return (TWR) — Modified Dietz.
    Nakit akışları bağımsız CashFlow tablosundan okunur (transaction'lardan bağımsız).
    """
    snapshots = (
        db.query(models.PortfolioSnapshot)
        .filter(models.PortfolioSnapshot.user_id == current_user.id)
        .order_by(models.PortfolioSnapshot.snapshot_date.asc())
        .all()
    )

    if len(snapshots) < 2:
        return {
            "twr": 0, "twr_annualized": 0, "periods": [],
            "message": "TWR hesabı için en az 2 snapshot gerekli",
        }

    cash_flows_db = (
        db.query(models.CashFlow)
        .filter(models.CashFlow.user_id == current_user.id)
        .order_by(models.CashFlow.flow_date.asc())
        .all()
    )

    periods = []
    cumulative_twr = 1.0
    covered_days = 0
    cf_idx = 0

    for i in range(1, len(snapshots)):
        prev_snap = snapshots[i - 1]
        curr_snap = snapshots[i]

        period_start = prev_snap.snapshot_date
        period_end = curr_snap.snapshot_date
        period_seconds = (period_end - period_start).total_seconds()
        if period_seconds <= 0:
            continue

        beginning_value = prev_snap.total_market_value or 0
        ending_value = curr_snap.total_market_value or 0
        period_days = max(1, (period_end - period_start).days)

        cash_flow = 0.0
        weighted_cash_flow = 0.0

        while cf_idx < len(cash_flows_db):
            cf_row = cash_flows_db[cf_idx]
            if cf_row.flow_date <= period_start:
                cf_idx += 1
                continue
            if cf_row.flow_date > period_end:
                break

            cf_value = cf_row.amount or 0
            cf_currency = (cf_row.currency or "TRY").upper()
            if cf_currency != "TRY":
                fx_rate = _interpolate_fx_rate(cf_currency, prev_snap, curr_snap, cf_row.flow_date)
                cf_value *= fx_rate

            signed = cf_value if cf_row.flow_type == "inflow" else -cf_value
            cash_flow += signed

            seconds_remaining = (period_end - cf_row.flow_date).total_seconds()
            weight = max(0.0, min(1.0, seconds_remaining / period_seconds))
            weighted_cash_flow += signed * weight
            cf_idx += 1

        if beginning_value <= 0:
            periods.append({
                "from_date": period_start.isoformat(),
                "to_date": period_end.isoformat(),
                "beginning_value": 0,
                "ending_value": round(ending_value, 2),
                "cash_flow": round(cash_flow, 2),
                "period_return": 0,
                "days": period_days,
            })
            continue

        denominator = beginning_value + weighted_cash_flow
        if denominator > 0:
            period_return = (ending_value - beginning_value - cash_flow) / denominator
        else:
            period_return = (ending_value - beginning_value - cash_flow) / beginning_value

        cumulative_twr *= (1 + period_return)
        covered_days += period_days

        periods.append({
            "from_date": period_start.isoformat(),
            "to_date": period_end.isoformat(),
            "beginning_value": round(beginning_value, 2),
            "ending_value": round(ending_value, 2),
            "cash_flow": round(cash_flow, 2),
            "period_return": round(period_return * 100, 4),
            "days": period_days,
        })

    total_twr = (cumulative_twr - 1) * 100
    total_days = (snapshots[-1].snapshot_date - snapshots[0].snapshot_date).days
    annualized = 0.0
    if total_days > 0 and cumulative_twr > 0:
        annualized = (cumulative_twr ** (365.0 / total_days) - 1) * 100

    from app.services.fx import FXService as _FXS

    def _to_try(amt, cur):
        cur = (cur or "TRY").upper()
        if cur == "TRY":
            return amt
        rate = _FXS.get_rate(cur, "TRY")
        return amt * rate if rate else amt

    total_cash_inflow = sum(_to_try(c.amount, c.currency) for c in cash_flows_db if c.flow_type == "inflow")
    total_cash_outflow = sum(_to_try(c.amount, c.currency) for c in cash_flows_db if c.flow_type == "outflow")

    cash_flow_details = [
        {
            "id": c.id,
            "flow_type": c.flow_type,
            "amount": c.amount,
            "amount_try": round(_to_try(c.amount, c.currency), 2),
            "currency": c.currency,
            "date": c.flow_date.isoformat() if c.flow_date else None,
            "note": c.note or "",
        }
        for c in cash_flows_db
    ]

    return {
        "twr": round(total_twr, 2),
        "twr_annualized": round(annualized, 2),
        "total_days": total_days,
        "snapshot_count": len(snapshots),
        "period_count": len(periods),
        "cash_flow_count": len(cash_flows_db),
        "total_cash_inflow": round(total_cash_inflow, 2),
        "total_cash_outflow": round(total_cash_outflow, 2),
        "first_snapshot_date": snapshots[0].snapshot_date.isoformat() if snapshots else None,
        "last_snapshot_date": snapshots[-1].snapshot_date.isoformat() if snapshots else None,
        "first_snapshot_value": round(snapshots[0].total_market_value or 0, 2) if snapshots else 0,
        "last_snapshot_value": round(snapshots[-1].total_market_value or 0, 2) if snapshots else 0,
        "cash_flows": cash_flow_details,
        "periods": periods,
    }


COMPARISON_BENCHMARKS = {
    "XAU/USD": "GC=F",
    "USD/TRY": "USDTRY=X",
    "BIST 100": "XU100.IS",
    "BIST 30": "XU030.IS",
    "Gümüş": "SI=F",
}


def _fetch_single_benchmark(name, symbol, period1, period2, snapshot_dates):
    """Tek bir benchmark için veri çeker (Yahoo Finance, TEFAS veya DB)."""
    import requests as _req
    import urllib3 as _u3
    _u3.disable_warnings()

    try:
        if symbol.startswith("INTEREST:"):
            return _calc_interest_benchmark(name, float(symbol.split(":")[1]), snapshot_dates)

        if symbol.startswith("DB:"):
            return _fetch_db_benchmark(name, symbol.split(":")[1], snapshot_dates)

        if symbol.startswith("TEFAS:"):
            return _fetch_tefas_benchmark(name, symbol.split(":")[1], snapshot_dates)

        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?period1={period1}&period2={period2}&interval=1d"
        resp = _req.get(url, headers={"User-Agent": "Mozilla/5.0"}, verify=False, timeout=10)
        chart = resp.json().get("chart", {})
        result = chart.get("result")
        if not result:
            return name, {"error": chart.get("error", {}).get("description", "Veri yok"), "series": []}

        timestamps = result[0].get("timestamp", [])
        closes = result[0].get("indicators", {}).get("quote", [{}])[0].get("close", [])
        if not timestamps or not closes:
            return name, {"error": "Veri yok", "series": []}

        price_dates = []
        for ts, c in zip(timestamps, closes):
            if c is not None:
                price_dates.append((datetime.utcfromtimestamp(ts).strftime("%Y-%m-%d"), float(c)))

        if not price_dates:
            return name, {"error": "Veri yok", "series": []}

        return name, _build_benchmark_series(price_dates, snapshot_dates)
    except Exception as e:
        return name, {"error": str(e), "series": []}


def _calc_interest_benchmark(name, annual_rate, snapshot_dates):
    """Yıllık faiz oranıyla bileşik getiri benchmark'ı hesaplar."""
    try:
        base_date = datetime.strptime(snapshot_dates[0], "%Y-%m-%d")
        rate = annual_rate / 100.0
        series = []
        for snap_str in snapshot_dates[1:]:
            snap_date = datetime.strptime(snap_str, "%Y-%m-%d")
            days = (snap_date - base_date).days
            cumulative = ((1 + rate) ** (days / 365.0) - 1) * 100
            series.append({"date": snap_str, "value": round(cumulative, 2)})

        total_change = series[-1]["value"] if series else 0
        return name, {"total_change": round(total_change, 2), "series": series}
    except Exception as e:
        return name, {"error": str(e), "series": []}


def _fetch_db_benchmark(name, symbol, snapshot_dates):
    """Veritabanındaki fiyat geçmişinden benchmark serisi oluşturur."""
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        instrument = db.query(models.Instrument).filter(
            func.upper(models.Instrument.symbol) == symbol.upper()
        ).first()
        if not instrument:
            return name, {"error": f"{symbol} enstrümanı bulunamadı", "series": []}

        first_dt = datetime.strptime(snapshot_dates[0], "%Y-%m-%d") - timedelta(days=10)
        last_dt = datetime.strptime(snapshot_dates[-1], "%Y-%m-%d") + timedelta(days=2)

        prices = (
            db.query(models.Price)
            .filter(
                models.Price.instrument_id == instrument.id,
                models.Price.datetime >= first_dt,
                models.Price.datetime <= last_dt,
            )
            .order_by(models.Price.datetime.asc())
            .all()
        )
        if not prices:
            return name, {"error": f"{symbol} fiyat geçmişi yok", "series": []}

        price_dates = []
        for p in prices:
            d = p.datetime.strftime("%Y-%m-%d") if p.datetime else None
            if d and p.price:
                price_dates.append((d, float(p.price)))

        if not price_dates:
            return name, {"error": f"{symbol} fiyat verisi yok", "series": []}

        return name, _build_benchmark_series(price_dates, snapshot_dates)
    except Exception as e:
        return name, {"error": str(e), "series": []}
    finally:
        db.close()


def _fetch_tefas_benchmark(name, fund_code, snapshot_dates):
    """TEFAS fonları için tarihsel veri çekip benchmark serisi oluşturur."""
    import requests as _req
    import urllib3 as _u3
    _u3.disable_warnings()

    try:
        first_date = datetime.strptime(snapshot_dates[0], "%Y-%m-%d") - timedelta(days=10)
        last_date = datetime.strptime(snapshot_dates[-1], "%Y-%m-%d") + timedelta(days=2)

        url = "https://www.tefas.gov.tr/api/DB/BindHistoryInfo"
        payload = {
            "fontip": fund_code.upper(),
            "bastarih": first_date.strftime("%d.%m.%Y"),
            "bittarih": last_date.strftime("%d.%m.%Y"),
            "fonturkod": "",
            "fonunvantip": "",
        }
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Referer": "https://www.tefas.gov.tr/",
        }

        resp = _req.post(url, json=payload, headers=headers, timeout=15, verify=False)
        if resp.status_code != 200:
            return name, {"error": f"TEFAS HTTP {resp.status_code}", "series": []}

        data = resp.json()
        if not data or not isinstance(data, list) or len(data) == 0:
            return name, {"error": "TEFAS veri yok", "series": []}

        price_dates = []
        for row in data:
            date_str = row.get("TARIH") or row.get("tarih") or ""
            price = row.get("FIYAT") or row.get("fiyat")
            if date_str and price is not None:
                try:
                    d = date_str.split("T")[0] if "T" in date_str else date_str
                    price_dates.append((d, float(str(price).replace(",", "."))))
                except (ValueError, TypeError):
                    continue

        price_dates.sort(key=lambda x: x[0])

        if not price_dates:
            return name, {"error": "TEFAS fiyat verisi yok", "series": []}

        return name, _build_benchmark_series(price_dates, snapshot_dates)
    except Exception as e:
        return name, {"error": str(e), "series": []}


def _build_benchmark_series(price_dates, snapshot_dates):
    """Fiyat verisinden kümülatif getiri serisi oluşturur."""
    base_price = None
    series = []
    for snap_str in snapshot_dates:
        closest_price = None
        for pd_date, pd_price in price_dates:
            if pd_date <= snap_str:
                closest_price = pd_price
        if closest_price is None:
            closest_price = price_dates[0][1]
        if base_price is None:
            base_price = closest_price
            continue
        change_pct = ((closest_price - base_price) / base_price) * 100
        series.append({"date": snap_str, "value": round(change_pct, 2)})

    total_change = series[-1]["value"] if series else 0
    return {"total_change": round(total_change, 2), "series": series}


def _get_benchmark_data(snapshots, first_date, last_date, benchmarks, user_id: int = 0):
    """Cache varsa döndür, yoksa paralel çek ve cache'le (kullanıcı bazlı)."""
    from concurrent.futures import ThreadPoolExecutor

    cache = _benchmark_cache.get(user_id)
    if cache and cache["data"] and cache["updated_at"]:
        age = (datetime.now() - cache["updated_at"]).total_seconds()
        if age < 600:
            return cache["data"]

    period1 = int((first_date - timedelta(days=7)).timestamp())
    period2 = int((last_date + timedelta(days=2)).timestamp())
    snapshot_dates = [s.snapshot_date.strftime("%Y-%m-%d") for s in snapshots]

    results = {}
    with ThreadPoolExecutor(max_workers=len(benchmarks)) as executor:
        futures = [
            executor.submit(_fetch_single_benchmark, n, s, period1, period2, snapshot_dates)
            for n, s in benchmarks.items()
        ]
        for f in futures:
            name, result = f.result()
            results[name] = result

    _benchmark_cache[user_id] = {"data": results, "updated_at": datetime.now()}
    return results


def _refresh_benchmark_cache_background(user_id: int):
    """Fiyat güncellemesi sonrası benchmark cache'ini arka planda yeniler."""
    from app.db import SessionLocal
    db = SessionLocal()
    try:
        snapshots = (
            db.query(models.PortfolioSnapshot)
            .filter(models.PortfolioSnapshot.user_id == user_id)
            .order_by(models.PortfolioSnapshot.snapshot_date.asc())
            .all()
        )
        if len(snapshots) < 2:
            return

        first_date = snapshots[0].snapshot_date
        last_date = snapshots[-1].snapshot_date

        _benchmark_cache.pop(user_id, None)
        _get_benchmark_data(snapshots, first_date, last_date, COMPARISON_BENCHMARKS, user_id=user_id)
        print(f"[Background] Benchmark cache yenilendi ({len(COMPARISON_BENCHMARKS)} benchmark)")
    except Exception as e:
        print(f"[Background] Benchmark cache hatası: {e}")
    finally:
        db.close()


@app.get("/portfolio/twr/comparison")
def get_twr_comparison(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Portföy TWR'sını benchmark'larla karşılaştırır."""
    account_ids = _user_account_ids(db, current_user.id)
    if not account_ids:
        return {"error": "Portföy boş"}

    snapshots = (
        db.query(models.PortfolioSnapshot)
        .filter(models.PortfolioSnapshot.user_id == current_user.id)
        .order_by(models.PortfolioSnapshot.snapshot_date.asc())
        .all()
    )
    if len(snapshots) < 2:
        return {"error": "En az 2 snapshot gerekli"}

    first_date = snapshots[0].snapshot_date
    last_date = snapshots[-1].snapshot_date

    # Portföy TWR kümülatif serisi (CashFlow tablosundan)
    cash_flows_db = (
        db.query(models.CashFlow)
        .filter(models.CashFlow.user_id == current_user.id)
        .order_by(models.CashFlow.flow_date.asc())
        .all()
    )

    portfolio_series = []
    cumulative = 1.0
    cf_idx = 0
    for i in range(1, len(snapshots)):
        prev_snap = snapshots[i - 1]
        curr_snap = snapshots[i]
        period_start = prev_snap.snapshot_date
        period_end = curr_snap.snapshot_date
        period_seconds = (period_end - period_start).total_seconds()
        if period_seconds <= 0:
            continue

        bv = prev_snap.total_market_value or 0
        ev = curr_snap.total_market_value or 0

        cf = 0.0
        wcf = 0.0
        while cf_idx < len(cash_flows_db):
            cf_row = cash_flows_db[cf_idx]
            if cf_row.flow_date <= period_start:
                cf_idx += 1
                continue
            if cf_row.flow_date > period_end:
                break
            cf_val = cf_row.amount or 0
            cf_cur = (cf_row.currency or "TRY").upper()
            if cf_cur != "TRY":
                fx = _interpolate_fx_rate(cf_cur, prev_snap, curr_snap, cf_row.flow_date)
                cf_val *= fx
            signed = cf_val if cf_row.flow_type == "inflow" else -cf_val
            cf += signed
            sr = (period_end - cf_row.flow_date).total_seconds()
            w = max(0.0, min(1.0, sr / period_seconds))
            wcf += signed * w
            cf_idx += 1

        if bv > 0:
            denom = bv + wcf
            pr = (ev - bv - cf) / denom if denom > 0 else (ev - bv - cf) / bv
            cumulative *= (1 + pr)

        portfolio_series.append({
            "date": curr_snap.snapshot_date.strftime("%Y-%m-%d"),
            "value": round((cumulative - 1) * 100, 2),
        })

    # Benchmark verileri — cache varsa kullan, yoksa çek
    benchmark_results = _get_benchmark_data(snapshots, first_date, last_date, COMPARISON_BENCHMARKS, user_id=current_user.id)

    portfolio_total = portfolio_series[-1]["value"] if portfolio_series else 0

    return {
        "first_date": first_date.strftime("%Y-%m-%d"),
        "last_date": last_date.strftime("%Y-%m-%d"),
        "total_days": (last_date - first_date).days,
        "portfolio": {
            "total_change": round(portfolio_total, 2),
            "series": portfolio_series,
        },
        "benchmarks": benchmark_results,
    }


@app.get("/portfolio/snapshots", response_model=list[schemas.PortfolioSnapshotOut])
def list_portfolio_snapshots(
    limit: int = 30,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    snapshots = (
        db.query(models.PortfolioSnapshot)
        .filter(models.PortfolioSnapshot.user_id == current_user.id)
        .order_by(models.PortfolioSnapshot.snapshot_date.desc())
        .limit(limit)
        .all()
    )
    return list(reversed(snapshots))


@app.get("/portfolio/snapshot/{snapshot_id}")
def get_snapshot_detail(
    snapshot_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    snapshot = db.query(models.PortfolioSnapshot).filter(
        models.PortfolioSnapshot.id == snapshot_id,
        models.PortfolioSnapshot.user_id == current_user.id,
    ).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot bulunamadı")
    
    # Pozisyonları çek
    position_snapshots = (
        db.query(models.PositionSnapshot)
        .filter(models.PositionSnapshot.portfolio_snapshot_id == snapshot_id)
        .all()
    )
    
    # Enstrüman bilgilerini ekle
    positions_with_details = []
    for pos_snap in position_snapshots:
        instrument = db.query(models.Instrument).filter(models.Instrument.id == pos_snap.instrument_id).first()
        if instrument:
            positions_with_details.append({
                "id": pos_snap.id,
                "instrument_id": pos_snap.instrument_id,
                "symbol": instrument.symbol,
                "name": instrument.name,
                "quantity": pos_snap.quantity,
                "avg_cost": pos_snap.avg_cost,
                "current_price": pos_snap.current_price,
                "market_value": pos_snap.market_value,
                "profit_loss": pos_snap.profit_loss,
                "profit_loss_pct": pos_snap.profit_loss_pct,
                "primary_tag": pos_snap.primary_tag,
            })
    
    return {
        "snapshot": snapshot,
        "positions": positions_with_details
    }


@app.get("/portfolio/compare/{snapshot_id1}/{snapshot_id2}")
def compare_snapshots(
    snapshot_id1: int,
    snapshot_id2: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    snap1 = db.query(models.PortfolioSnapshot).filter(
        models.PortfolioSnapshot.id == snapshot_id1,
        models.PortfolioSnapshot.user_id == current_user.id,
    ).first()
    snap2 = db.query(models.PortfolioSnapshot).filter(
        models.PortfolioSnapshot.id == snapshot_id2,
        models.PortfolioSnapshot.user_id == current_user.id,
    ).first()
    
    if not snap1 or not snap2:
        raise HTTPException(status_code=404, detail="Snapshot bulunamadı")
    
    # Pozisyonları çek
    positions1 = db.query(models.PositionSnapshot).filter(models.PositionSnapshot.portfolio_snapshot_id == snapshot_id1).all()
    positions2 = db.query(models.PositionSnapshot).filter(models.PositionSnapshot.portfolio_snapshot_id == snapshot_id2).all()
    
    # Enstrüman bazlı karşılaştırma
    pos1_map = {p.instrument_id: p for p in positions1}
    pos2_map = {p.instrument_id: p for p in positions2}
    
    all_instrument_ids = set(pos1_map.keys()) | set(pos2_map.keys())

    # Bulk fetch instruments (avoid N+1)
    instruments_map = {}
    if all_instrument_ids:
        instruments_list = db.query(models.Instrument).filter(models.Instrument.id.in_(all_instrument_ids)).all()
        instruments_map = {inst.id: inst for inst in instruments_list}

    comparisons = []
    for inst_id in all_instrument_ids:
        instrument = instruments_map.get(inst_id)
        if not instrument:
            continue
        
        pos1 = pos1_map.get(inst_id)
        pos2 = pos2_map.get(inst_id)
        
        # Değerler
        prev_qty = pos1.quantity if pos1 else 0
        curr_qty = pos2.quantity if pos2 else 0
        prev_price = pos1.current_price if pos1 else 0
        curr_price = pos2.current_price if pos2 else 0
        prev_value = pos1.market_value if pos1 else 0
        curr_value = pos2.market_value if pos2 else 0
        prev_pl = pos1.profit_loss if pos1 else 0
        curr_pl = pos2.profit_loss if pos2 else 0
        prev_avg_cost = pos1.avg_cost if pos1 else 0
        curr_avg_cost = pos2.avg_cost if pos2 else 0
        
        # Değişimler
        price_change_pct = ((curr_price - prev_price) / prev_price * 100) if prev_price > 0 else 0
        value_change_pct = ((curr_value - prev_value) / prev_value * 100) if prev_value > 0 else 0
        pl_change = curr_pl - prev_pl
        
        comparisons.append({
            "instrument_id": inst_id,
            "symbol": instrument.symbol,
            "name": instrument.name,
            "previous_quantity": prev_qty,
            "current_quantity": curr_qty,
            "previous_price": prev_price,
            "current_price": curr_price,
            "previous_value": prev_value,
            "current_value": curr_value,
            "previous_avg_cost": prev_avg_cost,
            "current_avg_cost": curr_avg_cost,
            "price_change_pct": price_change_pct,
            "value_change_pct": value_change_pct,
            "profit_loss_change": pl_change,
            "status": "new" if not pos1 else ("sold" if not pos2 else "existing")
        })
    
    # En çok artan/azalanları sırala
    comparisons.sort(key=lambda x: x["price_change_pct"], reverse=True)
    
    return {
        "snapshot1": {
            "id": snap1.id,
            "date": snap1.snapshot_date,
            "total_value": snap1.total_market_value,
            "total_cost": snap1.total_cost_basis
        },
        "snapshot2": {
            "id": snap2.id,
            "date": snap2.snapshot_date,
            "total_value": snap2.total_market_value,
            "total_cost": snap2.total_cost_basis
        },
        "portfolio_change": {
            "value_change": snap2.total_market_value - snap1.total_market_value,
            "value_change_pct": ((snap2.total_market_value - snap1.total_market_value) / snap1.total_market_value * 100) if snap1.total_market_value > 0 else 0,
            "pl_change": snap2.total_profit_loss - snap1.total_profit_loss,
            "cost_change": snap2.total_cost_basis - snap1.total_cost_basis,
            "cost_change_pct": ((snap2.total_cost_basis - snap1.total_cost_basis) / snap1.total_cost_basis * 100) if snap1.total_cost_basis > 0 else 0
        },
        "instruments": comparisons
    }


@app.delete("/portfolio/snapshot/{snapshot_id}")
def delete_portfolio_snapshot(
    snapshot_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    snapshot = db.query(models.PortfolioSnapshot).filter(
        models.PortfolioSnapshot.id == snapshot_id,
        models.PortfolioSnapshot.user_id == current_user.id,
    ).first()
    if not snapshot:
        raise HTTPException(status_code=404, detail="Snapshot bulunamadı")
    
    position_count = len(snapshot.position_snapshots)
    
    # Position snapshots otomatik silinecek (cascade)
    db.delete(snapshot)
    db.commit()
    
    return {
        "message": "Snapshot silindi", 
        "snapshot_id": snapshot_id,
        "deleted_positions": position_count
    }


@app.delete("/portfolio/snapshots/all")
def delete_all_snapshots(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    user_snapshots = db.query(models.PortfolioSnapshot).filter(
        models.PortfolioSnapshot.user_id == current_user.id,
    ).all()
    snapshot_count = 0
    position_count = 0
    for snap in user_snapshots:
        position_count += len(snap.position_snapshots)
        db.delete(snap)
    snapshot_count = len(user_snapshots)
    
    db.commit()
    return {
        "message": "Tüm snapshot'lar silindi",
        "deleted_snapshots": snapshot_count,
        "deleted_positions": position_count
    }



@app.get("/fx/test/{currency}")
def test_fx_rate(currency: str):
    """
    Belirli bir para biriminin TRY kurunu test eder (debug için)
    
    Args:
        currency: Para birimi (USD, EUR, GBP)
    """
    from app.services.fx import FXService
    
    # TCMB'den dene
    tcmb_rate = FXService._fetch_from_tcmb(currency)
    
    # Yahoo Finance'den dene
    yahoo_rate = FXService.get_rate(currency, "TRY")
    
    return {
        "currency": currency.upper(),
        "tcmb_rate": tcmb_rate,
        "yahoo_rate": yahoo_rate,
        "final_rate": yahoo_rate,  # get_rate zaten TCMB'yi deniyor
        "source": "tcmb" if tcmb_rate else "yahoo_finance"
    }


@app.get("/fx/rate/{from_currency}/{to_currency}")
def get_fx_rate(from_currency: str, to_currency: str):
    """
    İki para birimi arasındaki kuru getirir
    Örnek: /fx/rate/USD/TRY
    """
    rate = FXService.get_rate(from_currency, to_currency)
    
    if rate is None:
        raise HTTPException(
            status_code=404,
            detail=f"Could not fetch rate for {from_currency}/{to_currency}"
        )
    
    return {
        "from": from_currency.upper(),
        "to": to_currency.upper(),
        "rate": rate,
        "timestamp": datetime.now().isoformat()
    }


@app.get("/fx/convert")
def convert_currency(amount: float, from_currency: str, to_currency: str = "TRY"):
    """
    Para birimi çevirisi yapar
    Örnek: /fx/convert?amount=100&from_currency=USD&to_currency=TRY
    """
    converted = FXService.convert(amount, from_currency, to_currency)
    
    if converted is None:
        raise HTTPException(
            status_code=404,
            detail=f"Could not convert {from_currency} to {to_currency}"
        )
    
    rate = FXService.get_rate(from_currency, to_currency)
    
    return {
        "amount": amount,
        "from": from_currency.upper(),
        "to": to_currency.upper(),
        "rate": rate,
        "converted_amount": converted,
        "timestamp": datetime.now().isoformat()
    }


# ============= PRICE ALERTS =============
@app.post("/alerts", response_model=schemas.PriceAlertOut)
def create_alert(
    payload: schemas.PriceAlertCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    instrument = db.query(models.Instrument).filter(models.Instrument.id == payload.instrument_id).first()
    if not instrument:
        raise HTTPException(status_code=404, detail="Enstrüman bulunamadı")
    if payload.alert_type not in ("above", "below", "change_pct"):
        raise HTTPException(status_code=400, detail="Geçersiz alarm tipi")
    alert = models.PriceAlert(
        user_id=current_user.id,
        instrument_id=payload.instrument_id,
        alert_type=payload.alert_type,
        target_value=payload.target_value,
        notes=payload.notes,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert


@app.get("/alerts", response_model=list[schemas.PriceAlertOut])
def list_alerts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.PriceAlert).filter(
        models.PriceAlert.user_id == current_user.id
    ).order_by(models.PriceAlert.created_at.desc()).all()


@app.get("/alerts/triggered", response_model=list[schemas.PriceAlertOut])
def get_triggered_alerts(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.PriceAlert).filter(
        models.PriceAlert.user_id == current_user.id,
        models.PriceAlert.is_triggered == True,
    ).order_by(models.PriceAlert.triggered_at.desc()).all()


@app.delete("/alerts/{alert_id}")
def delete_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    alert = db.query(models.PriceAlert).filter(
        models.PriceAlert.id == alert_id,
        models.PriceAlert.user_id == current_user.id,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alarm bulunamadı")
    db.delete(alert)
    db.commit()
    return {"message": "Alarm silindi"}


@app.patch("/alerts/{alert_id}/toggle")
def toggle_alert(
    alert_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    alert = db.query(models.PriceAlert).filter(
        models.PriceAlert.id == alert_id,
        models.PriceAlert.user_id == current_user.id,
    ).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alarm bulunamadı")
    alert.is_active = not alert.is_active
    db.commit()
    return {"is_active": alert.is_active}




@app.get("/sales", response_model=List[schemas.SaleRecordOut])
def get_sale_records(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account_ids = _user_account_ids(db, current_user.id)
    if not account_ids:
        return []
    sales = (
        db.query(models.SaleRecord)
        .join(models.Transaction, models.SaleRecord.sell_transaction_id == models.Transaction.id)
        .filter(models.Transaction.account_id.in_(account_ids))
        .order_by(models.SaleRecord.sale_date.desc())
        .all()
    )
    return sales


@app.post("/sales", response_model=schemas.SaleRecordOut)
def create_sale_record(
    payload: schemas.SaleRecordCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account_ids = _user_account_ids(db, current_user.id)
    buy_tx = db.query(models.Transaction).filter(
        models.Transaction.id == payload.buy_transaction_id,
        models.Transaction.account_id.in_(account_ids),
    ).first()
    if not buy_tx:
        raise HTTPException(status_code=404, detail="Buy transaction not found")
    
    # Enstrüman bilgisi
    instrument = db.query(models.Instrument).filter(models.Instrument.id == buy_tx.instrument_id).first()
    if not instrument:
        raise HTTPException(status_code=404, detail="Instrument not found")
    
    # Satış transaction'ı oluştur
    sell_tx = models.Transaction(
        type="sell",
        quantity=payload.sell_quantity,
        price=payload.sell_price,
        currency=payload.sell_currency,
        account_id=buy_tx.account_id,
        instrument_id=buy_tx.instrument_id,
        horizon=buy_tx.horizon,
        primary_tag=buy_tx.primary_tag,
        secondary_tags=buy_tx.secondary_tags
    )
    db.add(sell_tx)
    db.flush()  # ID'yi al
    
    # Döviz çevirimi
    buy_currency = buy_tx.currency.upper() if buy_tx.currency else "TRY"
    sell_currency = payload.sell_currency.upper()
    
    buy_fx_rate = 1.0
    if buy_currency == "USD":
        buy_fx_rate = get_usd_try_rate()
    elif buy_currency == "EUR":
        buy_fx_rate = FXService.get_rate("EUR", "TRY") or 1.0
    
    sell_fx_rate = 1.0
    if sell_currency == "USD":
        sell_fx_rate = get_usd_try_rate()
    elif sell_currency == "EUR":
        sell_fx_rate = FXService.get_rate("EUR", "TRY") or 1.0
    
    # Maliyet ve satış değeri (TRY)
    buy_cost_try = ((buy_tx.quantity or 0) * (buy_tx.price or 0) + (buy_tx.fees or 0)) * buy_fx_rate
    sell_value_try = (payload.sell_quantity * payload.sell_price) * sell_fx_rate
    
    # Kar/Zarar hesapla (orantılı)
    quantity_ratio = payload.sell_quantity / (buy_tx.quantity or 1)
    proportional_cost = buy_cost_try * quantity_ratio
    profit_loss_try = sell_value_try - proportional_cost
    profit_loss_pct = (profit_loss_try / proportional_cost * 100) if proportional_cost > 0 else 0
    
    # SaleRecord oluştur
    sale_record = models.SaleRecord(
        instrument_id=instrument.id,
        instrument_symbol=instrument.symbol,
        instrument_name=instrument.name,
        buy_transaction_id=buy_tx.id,
        buy_date=buy_tx.timestamp,
        buy_price=buy_tx.price,
        buy_quantity=buy_tx.quantity,
        buy_currency=buy_currency,
        buy_cost_try=buy_cost_try,
        sell_transaction_id=sell_tx.id,
        sell_price=payload.sell_price,
        sell_quantity=payload.sell_quantity,
        sell_currency=sell_currency,
        sell_value_try=sell_value_try,
        profit_loss_try=profit_loss_try,
        profit_loss_percentage=profit_loss_pct,
        notes=payload.notes,
        reason=payload.reason
    )
    
    db.add(sale_record)

    # Alış transaction'ı korunur — silinirse TWR, portföy geçmişi ve
    # snapshot tutarlılığı bozulur (orphan sell oluşur).

    db.commit()
    db.refresh(sale_record)
    
    return sale_record


@app.delete("/sales/{sale_id}")
def delete_sale_record(
    sale_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    account_ids = _user_account_ids(db, current_user.id)
    sale = db.query(models.SaleRecord).filter(models.SaleRecord.id == sale_id).first()
    if not sale:
        raise HTTPException(status_code=404, detail="Sale record not found")
    # Yetkilendirme: sell transaction üzerinden kontrol et (buy tx silinmiş olabilir)
    if sale.sell_transaction_id:
        sell_tx = db.query(models.Transaction).filter(
            models.Transaction.id == sale.sell_transaction_id,
            models.Transaction.account_id.in_(account_ids),
        ).first()
        if not sell_tx:
            raise HTTPException(status_code=403, detail="Yetkisiz işlem")
        db.delete(sell_tx)
    db.delete(sale)
    db.commit()
    return {"message": "Sale record deleted"}




# ============= INSIGHTS =============

DEFAULT_MODEL_PORTFOLIO = [
    {"tag_name": "Altın", "target_percentage": 15.0},
    {"tag_name": "Trade", "target_percentage": 5.0},
    {"tag_name": "Sıfır maliyet trade", "target_percentage": 35.0},
    {"tag_name": "TM Model Portföy", "target_percentage": 30.0},
    {"tag_name": "Fon", "target_percentage": 10.0},
    {"tag_name": "Kripto", "target_percentage": 5.0},
]


def _ensure_model_portfolio(db: Session, user_id: int):
    """Kullanıcının model portföy hedefleri yoksa varsayılanları oluştur."""
    existing = db.query(models.ModelPortfolioTarget).filter(
        models.ModelPortfolioTarget.user_id == user_id
    ).count()
    if existing == 0:
        for item in DEFAULT_MODEL_PORTFOLIO:
            db.add(models.ModelPortfolioTarget(
                user_id=user_id,
                tag_name=item["tag_name"],
                target_percentage=item["target_percentage"],
            ))
        db.commit()


@app.get("/insights/model-portfolio", response_model=List[schemas.ModelPortfolioTargetOut])
def get_model_portfolio(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _ensure_model_portfolio(db, current_user.id)
    return db.query(models.ModelPortfolioTarget).filter(
        models.ModelPortfolioTarget.user_id == current_user.id
    ).all()


@app.put("/insights/model-portfolio", response_model=List[schemas.ModelPortfolioTargetOut])
def update_model_portfolio(
    targets: List[schemas.ModelPortfolioTargetItem],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db.query(models.ModelPortfolioTarget).filter(
        models.ModelPortfolioTarget.user_id == current_user.id
    ).delete()
    new_targets = []
    for t in targets:
        obj = models.ModelPortfolioTarget(
            user_id=current_user.id,
            tag_name=t.tag_name,
            target_percentage=t.target_percentage,
        )
        db.add(obj)
        new_targets.append(obj)
    db.commit()
    for obj in new_targets:
        db.refresh(obj)
    return new_targets


@app.get("/insights/todos", response_model=List[schemas.InsightTodoOut])
def get_insight_todos(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.InsightTodo).filter(
        models.InsightTodo.user_id == current_user.id
    ).order_by(models.InsightTodo.is_completed, models.InsightTodo.created_at.desc()).all()


@app.post("/insights/todos", response_model=schemas.InsightTodoOut)
def create_insight_todo(
    payload: schemas.InsightTodoCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    todo = models.InsightTodo(
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        tag=payload.tag,
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@app.put("/insights/todos/{todo_id}", response_model=schemas.InsightTodoOut)
def update_insight_todo(
    todo_id: int,
    payload: schemas.InsightTodoUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    todo = db.query(models.InsightTodo).filter(
        models.InsightTodo.id == todo_id,
        models.InsightTodo.user_id == current_user.id,
    ).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo bulunamadı")
    if payload.title is not None:
        todo.title = payload.title
    if payload.description is not None:
        todo.description = payload.description
    if payload.tag is not None:
        todo.tag = payload.tag
    if payload.is_completed is not None:
        todo.is_completed = payload.is_completed
        todo.completed_at = datetime.now() if payload.is_completed else None
    db.commit()
    db.refresh(todo)
    return todo


@app.delete("/insights/todos/{todo_id}")
def delete_insight_todo(
    todo_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    todo = db.query(models.InsightTodo).filter(
        models.InsightTodo.id == todo_id,
        models.InsightTodo.user_id == current_user.id,
    ).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo bulunamadı")
    db.delete(todo)
    db.commit()
    return {"message": "Todo silindi"}


# ============= NOTIFICATIONS (BİLDİRİMLER) =============


@app.get("/notifications", response_model=List[schemas.NotificationOut])
def list_notifications(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    unread_only: bool = False,
):
    """Kullanıcının bildirimlerini listele"""
    query = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id
    )
    
    if unread_only:
        query = query.filter(models.Notification.is_read == False)
    
    return query.order_by(models.Notification.created_at.desc()).all()


@app.get("/notifications/unread-count")
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Okunmamış bildirim sayısı"""
    count = db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).count()
    return {"unread_count": count}


@app.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    payload: schemas.NotificationMarkRead,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Bildirimi okundu/okunmadı olarak işaretle"""
    notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Bildirim bulunamadı")
    
    notification.is_read = payload.is_read
    if payload.is_read:
        notification.read_at = datetime.now()
    else:
        notification.read_at = None
    
    db.commit()
    return {"success": True}


@app.patch("/notifications/read-all")
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Tüm bildirimleri okundu işaretle"""
    db.query(models.Notification).filter(
        models.Notification.user_id == current_user.id,
        models.Notification.is_read == False
    ).update({
        "is_read": True,
        "read_at": datetime.now()
    })
    db.commit()
    return {"success": True}


@app.delete("/notifications/{notification_id}")
def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Bildirimi sil"""
    notification = db.query(models.Notification).filter(
        models.Notification.id == notification_id,
        models.Notification.user_id == current_user.id
    ).first()
    
    if not notification:
        raise HTTPException(status_code=404, detail="Bildirim bulunamadı")
    
    db.delete(notification)
    db.commit()
    return {"success": True}


# Bildirim oluşturma helper fonksiyonu
def create_notification(
    db,
    user_id: int,
    notification_type: str,
    title: str,
    message: str,
    related_type: str = None,
    related_id: int = None
):
    """Bildirim oluştur (helper)"""
    notification = models.Notification(
        user_id=user_id,
        notification_type=notification_type,
        title=title,
        message=message,
        related_type=related_type,
        related_id=related_id
    )
    db.add(notification)
    db.commit()
    return notification


