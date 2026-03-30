#!/bin/bash

# Portfolio App Başlatma Script'i
echo "🚀 Portfolio App başlatılıyor..."
echo ""

# Proje dizinine git
cd "$(dirname "$0")"

# Port 8000 doluysa eski backend'i zorla kapat
if lsof -ti :8000 >/dev/null 2>&1; then
  echo "⚠️  Port 8000 dolu, eski işlem kapatılıyor (kill -9)..."
  lsof -ti :8000 | xargs kill -9 2>/dev/null || true
  sleep 3
fi

# Backend'i başlat
echo "📦 Backend başlatılıyor (port 8000)..."
source .venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
echo "✅ Backend başlatıldı (PID: $BACKEND_PID)"
echo ""

# 3 saniye bekle (backend'in başlaması için)
sleep 3

# Frontend'i başlat
echo "🎨 Frontend başlatılıyor (port 5173)..."
cd frontend
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!
echo "✅ Frontend başlatıldı (PID: $FRONTEND_PID)"
echo ""

echo "🎉 Uygulama başarıyla başlatıldı!"
echo ""
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "?.?.?.?")
echo "📍 Backend:  http://localhost:8000      | http://$LOCAL_IP:8000"
echo "📍 Frontend: http://localhost:5173      | http://$LOCAL_IP:5173"
echo ""
echo "⏹️  Durdurmak için: Ctrl+C tuşlarına basın"
echo ""

# Process'leri bekle
wait
