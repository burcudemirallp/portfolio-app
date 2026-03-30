"""
Otomatik fiyat güncelleme zamanlayıcısı.
APScheduler ile belirli aralıklarla fiyatları çeker ve alarmları kontrol eder.
"""
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger

scheduler = BackgroundScheduler()
_is_running = False


def check_price_alerts(db_session):
    """Tüm aktif alarmları kontrol et ve tetiklenenleri işaretle."""
    from app import models
    from sqlalchemy import func, and_

    active_alerts = db_session.query(models.PriceAlert).filter(
        models.PriceAlert.is_active == True,
        models.PriceAlert.is_triggered == False,
    ).all()

    if not active_alerts:
        return 0

    # Bulk fetch latest prices for relevant instruments
    instrument_ids = list(set(a.instrument_id for a in active_alerts))
    subq = (
        db_session.query(
            models.Price.instrument_id,
            func.max(models.Price.datetime).label('max_dt')
        )
        .filter(models.Price.instrument_id.in_(instrument_ids))
        .group_by(models.Price.instrument_id)
        .subquery()
    )
    prices = (
        db_session.query(models.Price)
        .join(subq, and_(
            models.Price.instrument_id == subq.c.instrument_id,
            models.Price.datetime == subq.c.max_dt
        ))
        .all()
    )
    price_map = {p.instrument_id: p.price for p in prices}

    triggered_count = 0
    for alert in active_alerts:
        current_price = price_map.get(alert.instrument_id)
        if current_price is None:
            continue

        should_trigger = False
        if alert.alert_type == "above" and current_price >= alert.target_value:
            should_trigger = True
        elif alert.alert_type == "below" and current_price <= alert.target_value:
            should_trigger = True
        # change_pct: check % change from previous price (skip for now, need prev price)

        if should_trigger:
            alert.is_triggered = True
            alert.triggered_at = datetime.utcnow()
            alert.triggered_price = current_price
            triggered_count += 1

    if triggered_count > 0:
        db_session.commit()

    return triggered_count


def auto_fetch_prices():
    """Tüm enstrüman fiyatlarını güncelle ve alarmları kontrol et."""
    from app.db import SessionLocal
    from app import models
    from app.services.pricing import fetch_instrument_price, PriceFetcher
    import random
    import time

    db = SessionLocal()
    try:
        instruments = db.query(models.Instrument).all()
        success_count = 0

        for inst in instruments:
            try:
                price_data = None
                if inst.asset_type and inst.asset_type.lower() in ["altın", "altin", "gold"]:
                    purity = 24
                    if "22" in (inst.symbol or "") or "22" in (inst.name or ""):
                        purity = 22
                    elif "18" in (inst.symbol or "") or "18" in (inst.name or ""):
                        purity = 18
                    price_data = PriceFetcher.fetch_gold_price_per_gram(purity=purity, currency=inst.currency or "TRY")
                elif inst.asset_type and inst.asset_type.lower() in ["fon", "fund"]:
                    price_data = PriceFetcher._fetch_tefas_fund_price(inst.symbol)
                else:
                    price_data = fetch_instrument_price(symbol=inst.symbol, market=inst.market, asset_type=inst.asset_type)

                if price_data:
                    price = models.Price(
                        instrument_id=inst.id,
                        price=price_data["price"],
                        currency=price_data["currency"],
                        source=price_data["source"],
                        datetime=datetime.now(),
                    )
                    db.add(price)
                    try:
                        db.commit()
                        success_count += 1
                    except Exception as commit_err:
                        db.rollback()
                        print(f"[Scheduler] DB commit error for {inst.symbol}: {commit_err}")

                time.sleep(random.uniform(1.5, 3.0))
            except Exception as e:
                print(f"Auto price error for {inst.symbol}: {e}")
                db.rollback()
                continue

        # Check alerts after price update
        triggered = check_price_alerts(db)
        print(f"[Scheduler] Prices updated: {success_count}/{len(instruments)}, Alerts triggered: {triggered}")
    except Exception as e:
        print(f"[Scheduler] Error: {e}")
    finally:
        db.close()


def start_scheduler(interval_minutes: int = 30):
    """Zamanlayıcıyı başlat."""
    global _is_running
    if _is_running:
        return

    scheduler.add_job(
        auto_fetch_prices,
        trigger=IntervalTrigger(minutes=interval_minutes),
        id="auto_price_update",
        name="Otomatik fiyat güncelleme",
        replace_existing=True,
    )
    scheduler.start()
    _is_running = True
    print(f"[Scheduler] Started: auto price update every {interval_minutes} minutes")


def stop_scheduler():
    """Zamanlayıcıyı durdur."""
    global _is_running
    if _is_running:
        scheduler.shutdown(wait=False)
        _is_running = False


def get_scheduler_status():
    """Zamanlayıcı durumu."""
    global _is_running
    jobs = []
    if _is_running:
        for job in scheduler.get_jobs():
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run": str(job.next_run_time) if job.next_run_time else None,
            })
    return {"running": _is_running, "jobs": jobs}
