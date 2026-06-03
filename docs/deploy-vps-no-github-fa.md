# دیپلوی وقتی VPS به GitHub دسترسی ندارد

روی بعضی VPSها `git pull` خطا می‌دهد:

```text
Could not resolve host: github.com
```

در این حالت **کد را از ویندوز/لپ‌تاپ خودتان** build و با `scp` بفرستید؛ روی سرور `git pull` لازم نیست.

## از ویندوز (توصیه‌شده)

```powershell
cd D:\Workspace\logestic
.\scripts\deploy-vps-from-windows.ps1
```

این اسکریپت:

1. روی PC: `git pull` + build بک‌اند و وب
2. آپلود `apps/backend/dist` و `apps/backend/prisma` و `apps/web/dist`
3. روی VPS: فقط `prisma generate` + `migrate deploy` + restart — **بدون** `npm run build` روی سرور

## فقط روی VPS (بعد از آپلود از PC)

```bash
cd /opt/logestic/logestic/apps/backend
npx prisma generate
npx prisma migrate deploy
systemctl restart logestic-api
curl -s http://127.0.0.1:4000/api/health
```

**مهم:** روی VPS `npm run build` نزنید اگر `git pull` نشده — سورس قدیمی است و `dist` تازهٔ آپلودشده را خراب می‌کند.

## اختیاری: رفع DNS برای git pull

اگر می‌خواهید روی سرور هم `git pull` کار کند، DNS را درست کنید (مثلاً `8.8.8.8` در `/etc/resolv.conf`) یا از آینه استفاده کنید.
