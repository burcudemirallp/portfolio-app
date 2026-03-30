#!/bin/bash

# Portfolio App Durdurma Script'i
echo "🛑 Portfolio App durduruluyor..."
echo ""

# Backend'i durdur (port 8000)
echo "📦 Backend durduruluyor..."
lsof -ti:8000 | xargs kill -9 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ Backend durduruldu"
else
    echo "⚠️  Backend zaten çalışmıyor"
fi

# Frontend'i durdur (port 5173)
echo "🎨 Frontend durduruluyor..."
lsof -ti:5173 | xargs kill -9 2>/dev/null
if [ $? -eq 0 ]; then
    echo "✅ Frontend durduruldu"
else
    echo "⚠️  Frontend zaten çalışmıyor"
fi

echo ""
echo "✅ Uygulama durduruldu!"
