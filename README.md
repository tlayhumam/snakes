# Snakes — سنيكس

نموذج عربي قابل للعب للعبة Snakes، مع رصيد تجريبي، جولات مدفوعة افتراضياً، روليت، إحالات، تخصيص الثعبان، محفظة ولوحة إدارة.

## التشغيل

واجهة الويب:

```bash
npm install
npm run dev
```

خدمة FastAPI وMySQL:

```bash
docker compose up --build
```

استخدم `.env.example` لضبط عنوان API. التوثيق التفاعلي للخدمة متاح على `http://localhost:8000/api/docs`.

## اختبارات التحقق

```bash
npm run build
./node_modules/.bin/tsc --noEmit
cd backend && .venv/bin/python -m pytest
```

كل الأموال والدفعات وطلبات السحب داخل هذا المشروع تجريبية ولا تحمل قيمة نقدية.
