from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime


class UserCreate(BaseModel):
    email: str
    username: str
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    username: str
    created_at: Optional[datetime] = None
    is_admin: bool = False

    class Config:
        from_attributes = True


class UserListOut(BaseModel):
    """Admin paneli için kullanıcı listesi (şifre yok)."""
    id: int
    email: str
    username: str
    created_at: Optional[datetime] = None
    is_admin: bool = False

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class SwitchUserRequest(BaseModel):
    """Admin: başka kullanıcı olarak oturum açmak için."""
    user_id: int


class InstrumentCreate(BaseModel):
    symbol: str
    name: Optional[str] = None
    asset_type: str   # stock, fund, gold, silver, etc.
    market: str       # BIST, NASDAQ, NYSE
    currency: str     # TRY, USD


class InstrumentOut(InstrumentCreate):
    id: int
    last_price: Optional[float] = None  # Son fiyat (orijinal para biriminde)
    last_price_try: Optional[float] = None  # Son fiyat (TRY cinsinden)
    last_price_updated_at: Optional[datetime] = None  # Son fiyat güncelleme zamanı

    class Config:
        from_attributes = True


class TransactionCreate(BaseModel):
    account_id: int
    instrument_id: int
    type: str         # buy, sell, fee, dividend
    quantity: float
    price: float
    fees: float = 0
    currency: str
    horizon: str      # trade, short, mid, long
    tag: Optional[str] = None  # DEPRECATED: kept for backward compatibility
    primary_tag: Optional[str] = None  # Primary tag (shown in charts)
    secondary_tags: Optional[str] = None  # Secondary tags (comma-separated, for filtering)
    is_cash_flow: int = 1  # 1=dışarıdan yeni para, 0=portföy içi rotasyon
    cash_flow_note: Optional[str] = None
    cash_flow_amount: Optional[float] = None
    timestamp: Optional[datetime] = None


class TransactionOut(BaseModel):
    id: int
    account_id: int
    instrument_id: int
    type: str
    quantity: float
    price: float
    fees: float
    currency: str
    horizon: str
    tag: Optional[str] = None  # DEPRECATED: kept for backward compatibility
    primary_tag: Optional[str] = None
    secondary_tags: Optional[str] = None
    is_cash_flow: int = 1
    cash_flow_note: Optional[str] = None
    cash_flow_amount: Optional[float] = None
    timestamp: datetime

    class Config:
        from_attributes = True


class AccountCreate(BaseModel):
    name: str
    base_currency: str = "TRY"


class AccountOut(BaseModel):
    id: int
    name: str
    base_currency: str

    class Config:
        from_attributes = True


class PriceCreate(BaseModel):
    instrument_id: int
    price: float
    currency: str = "TRY"
    source: str = "manual"
    datetime: Optional[datetime] = None


class PriceOut(BaseModel):
    id: int
    instrument_id: int
    price: float
    currency: str
    source: str
    datetime: datetime

    class Config:
        from_attributes = True


class PositionOut(BaseModel):
    instrument_id: int
    symbol: str
    name: Optional[str] = None
    asset_type: str
    market: str
    currency: str

    quantity: float
    cost_basis_try: float
    avg_cost_try: float

    last_price_try: Optional[float] = None
    market_value_try: Optional[float] = None
    unrealized_pl_try: Optional[float] = None

    class Config:
        from_attributes = True


class AssetAllocation(BaseModel):
    asset_type: str
    market_value_try: float
    percentage: float
    count: int


class ConcentrationRisk(BaseModel):
    symbol: str
    name: Optional[str] = None
    weight: float
    market_value_try: float
    level: str  # "medium" or "high"
    type: str  # "position" or "asset_type"


class PositionSummary(BaseModel):
    """Pozisyon özeti - tablo için"""
    instrument_id: int
    symbol: str
    name: Optional[str] = None
    asset_type: str
    market: str
    tag: Optional[str] = None
    primary_tag: Optional[str] = None
    
    secondary_tags: Optional[str] = None
    
    quantity: float
    avg_cost_try: float
    last_price_try: Optional[float] = None
    market_value_try: Optional[float] = None
    
    unrealized_pl_try: Optional[float] = None
    unrealized_pl_percentage: Optional[float] = None


class DataMetadata(BaseModel):
    """Veri güvenilirliği için metadata"""
    last_price_update_at: Optional[datetime] = None
    usdtry_rate: Optional[float] = None
    usdtry_updated_at: Optional[datetime] = None
    eurtry_rate: Optional[float] = None
    eurtry_updated_at: Optional[datetime] = None
    data_warnings: list[str] = []


class PortfolioSummary(BaseModel):
    total_cost_basis_try: float
    total_market_value_try: float
    total_unrealized_pl_try: float
    total_unrealized_pl_percentage: float
    
    position_count: int
    
    allocation_by_asset_type: list[AssetAllocation]
    allocation_by_market: list[AssetAllocation]
    allocation_by_horizon: list[AssetAllocation]
    allocation_by_currency: list[AssetAllocation]
    allocation_by_tag: list[AssetAllocation]
    allocation_by_primary_tag: list[AssetAllocation] = []
    
    # Pozisyon listesi
    positions: list[PositionSummary] = []
    top_positions: list[PositionSummary]
    top_gainers: list[PositionSummary]
    top_losers: list[PositionSummary]
    
    # Risk
    concentration_risks: list[ConcentrationRisk] = []
    
    # Veri güvenilirliği
    metadata: DataMetadata

class PositionSnapshotOut(BaseModel):
    """Enstrüman snapshot detayı"""
    id: int
    instrument_id: int
    symbol: str
    name: Optional[str] = None
    quantity: float
    avg_cost: float
    current_price: float
    market_value: float
    profit_loss: float
    profit_loss_pct: float
    primary_tag: Optional[str]
    
    class Config:
        from_attributes = True


class PortfolioSnapshotOut(BaseModel):
    id: int
    snapshot_date: datetime
    total_market_value: float
    total_cost_basis: float
    total_profit_loss: float
    total_profit_loss_pct: float
    transaction_count: int
    position_count: int
    usd_try_rate: Optional[float]
    eur_try_rate: Optional[float]
    
    class Config:
        from_attributes = True


class PortfolioSnapshotDetail(BaseModel):
    """Detaylı snapshot (pozisyonlar dahil)"""
    snapshot: PortfolioSnapshotOut
    positions: list[PositionSnapshotOut]


class PortfolioPerformance(BaseModel):
    """Portföy performans karşılaştırması"""
    current_value: float
    previous_value: float
    change_amount: float
    change_percentage: float
    period_days: int
    period_label: str  # "Son 1 ay", "Son 3 ay" vb.


class InstrumentPerformance(BaseModel):
    """Enstrüman bazlı performans karşılaştırması"""
    instrument_id: int
    symbol: str
    name: Optional[str] = None
    current_quantity: float
    current_price: float
    current_value: float
    previous_quantity: float
    previous_price: float
    previous_value: float
    price_change_pct: float
    value_change_pct: float
    profit_loss_change: float


# ============= SALE RECORDS =============
class SaleRecordCreate(BaseModel):
    """Satış kaydı oluşturma"""
    buy_transaction_id: int
    sell_price: float
    sell_quantity: float
    sell_currency: str = "TRY"
    notes: Optional[str] = None
    reason: Optional[str] = None


class SaleRecordOut(BaseModel):
    """Satış kaydı çıktısı"""
    id: int
    sale_date: datetime
    instrument_symbol: str
    instrument_name: Optional[str] = None
    buy_date: datetime
    buy_price: float
    buy_quantity: float
    buy_currency: str
    buy_cost_try: float
    sell_price: float
    sell_quantity: float
    sell_currency: str
    sell_value_try: float
    profit_loss_try: float
    profit_loss_percentage: float
    notes: Optional[str] = None
    reason: Optional[str] = None
    
    class Config:
        from_attributes = True
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PriceAlertCreate(BaseModel):
    instrument_id: int
    alert_type: str  # "above", "below", "change_pct"
    target_value: float
    notes: Optional[str] = None


class PriceAlertOut(BaseModel):
    id: int
    user_id: int
    instrument_id: int
    alert_type: str
    target_value: float
    is_active: bool
    is_triggered: bool
    triggered_at: Optional[datetime] = None
    triggered_price: Optional[float] = None
    created_at: Optional[datetime] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


class ScannerBistEmaRequest(BaseModel):
    """BIST EMA tarama isteği"""
    ema_periods: list[int] = [20, 50, 100]
    symbols: Optional[list[str]] = None
    use_my_instruments: bool = False  # True = sadece portföydeki BIST hisseleri


class ScannerBistVolumeRequest(BaseModel):
    """BIST hacim tarama isteği"""
    symbols: Optional[list[str]] = None
    min_ratio: float = 1.5
    lookback_days: int = 5


# === Bildirim ===

class NotificationCreate(BaseModel):
    notification_type: str = "info"
    title: str
    message: str
    related_type: Optional[str] = None
    related_id: Optional[int] = None


class NotificationOut(BaseModel):
    id: int
    user_id: int
    notification_type: str
    title: str
    message: str
    is_read: bool
    read_at: Optional[datetime]
    related_type: Optional[str]
    related_id: Optional[int]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationMarkRead(BaseModel):
    is_read: bool = True


class CashFlowCreate(BaseModel):
    flow_date: datetime
    amount: float
    currency: str = "TRY"
    flow_type: str = "inflow"  # inflow / outflow
    note: Optional[str] = None


class CashFlowOut(BaseModel):
    id: int
    user_id: int
    flow_date: datetime
    amount: float
    currency: str
    flow_type: str
    note: Optional[str] = None
    amount_try: Optional[float] = None
    created_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


# ============= INSIGHTS =============

class ModelPortfolioTargetItem(BaseModel):
    tag_name: str
    target_percentage: float


class ModelPortfolioTargetOut(BaseModel):
    id: int
    tag_name: str
    target_percentage: float

    model_config = ConfigDict(from_attributes=True)


class InsightTodoCreate(BaseModel):
    title: str
    description: Optional[str] = None
    tag: Optional[str] = None


class InsightTodoUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    tag: Optional[str] = None
    is_completed: Optional[bool] = None


class InsightTodoOut(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    tag: Optional[str] = None
    is_completed: bool
    created_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)
