from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from .db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    is_admin = Column(Boolean, default=False, nullable=False)

    accounts = relationship("Account", back_populates="user")
    snapshots = relationship("PortfolioSnapshot", back_populates="user")
    price_alerts = relationship("PriceAlert", back_populates="user")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")


class Instrument(Base):
    __tablename__ = "instruments"

    id = Column(Integer, primary_key=True, index=True)
    symbol = Column(String, index=True)
    name = Column(String, nullable=True)
    asset_type = Column(String)   # stock, fund, gold, etc.
    market = Column(String)       # BIST, NASDAQ
    currency = Column(String)     # TRY, USD

    price_alerts = relationship("PriceAlert", back_populates="instrument")


class PriceAlert(Base):
    __tablename__ = "price_alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id"), nullable=False)

    alert_type = Column(String, nullable=False)  # "above", "below", "change_pct"
    target_value = Column(Float, nullable=False)  # Target price or percentage

    is_active = Column(Boolean, default=True)
    is_triggered = Column(Boolean, default=False)
    triggered_at = Column(DateTime(timezone=True), nullable=True)
    triggered_price = Column(Float, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    notes = Column(String, nullable=True)

    user = relationship("User", back_populates="price_alerts")
    instrument = relationship("Instrument", back_populates="price_alerts")


class Account(Base):
    __tablename__ = "accounts"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    base_currency = Column(String)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)

    user = relationship("User", back_populates="accounts")


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(Integer, primary_key=True, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

    type = Column(String)          # buy, sell, fee, dividend
    quantity = Column(Float)
    price = Column(Float)
    fees = Column(Float, default=0)
    currency = Column(String)
    horizon = Column(String)       # trade, short, mid, long
    tag = Column(String, nullable=True)  # DEPRECATED: Old single tag field (kept for backward compatibility)
    primary_tag = Column(String, nullable=True)  # Primary tag (used in charts/graphs)
    secondary_tags = Column(String, nullable=True)  # Secondary tags (comma-separated, used in filters)
    is_cash_flow = Column(Integer, default=0)  # 1=dışarıdan yeni para, 0=portföy içi rotasyon
    cash_flow_note = Column(String, nullable=True)  # Paranın kaynağı (maaş, kira geliri vb.)
    cash_flow_amount = Column(Float, nullable=True)  # Nakit akışı tutarı (oluşturulduğunda sabitlenir, düzenlemelerden etkilenmez)

    account_id = Column(Integer, ForeignKey("accounts.id"))
    instrument_id = Column(Integer, ForeignKey("instruments.id"))

    account = relationship("Account")
    instrument = relationship("Instrument")

class Price(Base):
    __tablename__ = "prices"

    id = Column(Integer, primary_key=True, index=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id"), index=True)

    datetime = Column(DateTime(timezone=True), server_default=func.now())
    price = Column(Float)
    currency = Column(String)   # TRY, USD
    source = Column(String, default="manual")

    instrument = relationship("Instrument")


class SaleRecord(Base):
    """Satış kayıtları - Portföyden çıkarılan enstrümanların detaylı kaydı"""
    __tablename__ = "sale_records"
    
    id = Column(Integer, primary_key=True, index=True)
    sale_date = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    # Enstrüman bilgisi
    instrument_id = Column(Integer, ForeignKey("instruments.id"))
    instrument_symbol = Column(String)  # Symbol'ü sakla (enstrüman silinse bile)
    instrument_name = Column(String)
    
    # Alış bilgileri
    buy_transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    buy_date = Column(DateTime(timezone=True))
    buy_price = Column(Float)
    buy_quantity = Column(Float)
    buy_currency = Column(String)
    buy_cost_try = Column(Float)  # TRY cinsinden toplam maliyet
    
    # Satış bilgileri
    sell_transaction_id = Column(Integer, ForeignKey("transactions.id"), nullable=True)
    sell_price = Column(Float)
    sell_quantity = Column(Float)
    sell_currency = Column(String)
    sell_value_try = Column(Float)  # TRY cinsinden satış değeri
    
    # Kar/Zarar
    profit_loss_try = Column(Float)  # TRY cinsinden kar/zarar
    profit_loss_percentage = Column(Float)  # Yüzde kar/zarar
    
    # Notlar
    notes = Column(String, nullable=True)  # Kullanıcı notu
    reason = Column(String, nullable=True)  # Satış nedeni
    
    # İlişkiler
    instrument = relationship("Instrument")
    buy_transaction = relationship("Transaction", foreign_keys=[buy_transaction_id])
    sell_transaction = relationship("Transaction", foreign_keys=[sell_transaction_id])


class PortfolioSnapshot(Base):
    """Portföy değerinin günlük/haftalık anlık görüntüleri"""
    __tablename__ = "portfolio_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    snapshot_date = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    user = relationship("User", back_populates="snapshots")
    
    # Toplam değerler (TRY cinsinden)
    total_market_value = Column(Float)  # Toplam piyasa değeri
    total_cost_basis = Column(Float)    # Toplam maliyet
    total_profit_loss = Column(Float)   # Toplam kar/zarar
    total_profit_loss_pct = Column(Float)  # Kar/zarar yüzdesi
    
    # İşlem sayıları
    transaction_count = Column(Integer)
    position_count = Column(Integer)
    
    # Döviz kurları (o günkü)
    usd_try_rate = Column(Float, nullable=True)
    eur_try_rate = Column(Float, nullable=True)
    
    # İlişkiler (cascade delete ile position_snapshots otomatik silinir)
    position_snapshots = relationship("PositionSnapshot", back_populates="portfolio_snapshot", cascade="all, delete-orphan")


class PositionSnapshot(Base):
    """Her snapshot'taki enstrüman detayları"""
    __tablename__ = "position_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    portfolio_snapshot_id = Column(Integer, ForeignKey("portfolio_snapshots.id"), index=True)
    instrument_id = Column(Integer, ForeignKey("instruments.id"), index=True)
    
    # Pozisyon bilgileri
    quantity = Column(Float)  # Adet
    avg_cost = Column(Float)  # Ortalama maliyet (TRY)
    current_price = Column(Float)  # Güncel fiyat (TRY)
    market_value = Column(Float)  # Piyasa değeri (TRY)
    profit_loss = Column(Float)  # Kar/zarar (TRY)
    profit_loss_pct = Column(Float)  # Kar/zarar (%)
    
    # Ek bilgiler
    primary_tag = Column(String, nullable=True)
    broker_name = Column(String, nullable=True)
    
    # İlişkiler
    portfolio_snapshot = relationship("PortfolioSnapshot", back_populates="position_snapshots")
    instrument = relationship("Instrument")



class CashFlow(Base):
    """TWR için bağımsız nakit akışı kayıtları (transaction'lardan ayrı)"""
    __tablename__ = "cash_flows"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    flow_date = Column(DateTime(timezone=True), nullable=False)
    amount = Column(Float, nullable=False)
    currency = Column(String, default="TRY")
    flow_type = Column(String, default="inflow")  # inflow / outflow
    note = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")


class ModelPortfolioTarget(Base):
    """Model portföy hedefleri - primary_tag bazında hedef dağılım"""
    __tablename__ = "model_portfolio_targets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    tag_name = Column(String, nullable=False)
    target_percentage = Column(Float, nullable=False)

    user = relationship("User")


class InsightTodo(Base):
    """Insights sayfası aksiyon maddeleri"""
    __tablename__ = "insight_todos"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(String, nullable=True)
    tag = Column(String, nullable=True)
    is_completed = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User")


class Notification(Base):
    """Kullanıcı bildirimleri"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    notification_type = Column(String, nullable=False)  # "price_alert", "system", "info"
    title = Column(String, nullable=False)
    message = Column(String, nullable=False)
    
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime(timezone=True), nullable=True)
    
    related_type = Column(String, nullable=True)  # "alert", "transaction"
    related_id = Column(Integer, nullable=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    user = relationship("User", back_populates="notifications")
